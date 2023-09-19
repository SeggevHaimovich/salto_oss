/*
*                      Copyright 2023 Salto Labs Ltd.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with
* the License.  You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

import { BuiltinTypes, Change, Element, ElemID, getChangeData, InstanceElement, isContainerType, isInstanceChange, isInstanceElement, isObjectType, isPrimitiveType, isReferenceExpression, ObjectType, ReadOnlyElementsSource, ReferenceExpression, Value, Values } from '@salto-io/adapter-api'
import _, { isBoolean, isPlainObject, isString } from 'lodash'
import { TransformFuncArgs, transformValues, WALK_NEXT_STEP, WalkOnFunc, walkOnValue } from '@salto-io/adapter-utils'
import { parse, j2xParser } from 'fast-xml-parser'
import { decode, encode } from 'he'
import { collections } from '@salto-io/lowerdash'
import { logger } from '@salto-io/logging'
import { DATASET, NETSUITE, WORKBOOK } from '../constants'
import { LocalFilterCreator } from '../filter'
import { ATTRIBUTE_PREFIX, CDATA_TAG_NAME } from '../client/constants'
import { ParsedWorkbookType } from '../type_parsers/workbook_parsing/parsed_workbook'
import { DEFAULT_VALUE, IGNORE_T_VALUE, ParsedDatasetType, T, TYPE } from '../type_parsers/dataset_parsing/parsed_dataset'
import { TypeAndInnerTypes } from '../types/object_types'

const log = logger(module)
const { awu } = collections.asynciterable

const XML_TYPE = 'XML_TYPE'
const DO_NOT_ADD = 'DO_NOT_ADD'

const ITEM = '_ITEM_'
const TEXT = '#text'

const TValuesToIgnore = new Set([
  'workbook',
  'dataSet',
  'formula',
])

const keysToAddT = new Set([
  'formula',
])

const originalFields = [
  'scriptid',
  'name',
  'definition',
  'dependencies',
]

const isNumberStr = (str: string): boolean => !Number.isNaN(Number(str))

const cloneReportInstance = (instance: InstanceElement, type: ObjectType): InstanceElement =>
  // We create another element not using element.clone because
  // we need the new element to have a parsed analytic type.
  new InstanceElement(instance.elemID.name, type, instance.value,
    instance.path, instance.annotations)

const fetchTransformFunc = async (
  { value, field, path }: TransformFuncArgs,
  elementsSource: ReadOnlyElementsSource,
  elements: Element[],
  type: ObjectType,
): Promise<Value> => {
  const fieldType = (path?.getFullName().split('.').length === 4) ? type : await field?.getType()
  if (_.isUndefined(fieldType)) {
    log.debug('unexpected path in analytics type. Path: %o', path)
  }
  if (_.isPlainObject(value)) {
    if (TYPE in value) {
      if (value[TYPE] === 'null') {
        return {}
      } if (value[TYPE] === 'array') {
        if (value[ITEM] !== undefined) {
          return (Array.isArray(value[ITEM])) ? value[ITEM] : [value[ITEM]]
        }
        return []
      } if (value[TYPE] === 'boolean') {
        return value[TEXT]
      } if (value[TYPE] === 'string') {
        return String(value[TEXT])
      }
    }
    if (T in value) {
      if (!isObjectType(fieldType) || !(XML_TYPE in fieldType.annotations)) {
        log.debug('unexpected _T_ field in analytic instance. Path: %o', path)
        return {
          xmlType: value[T],
          ..._.omit(value, T),
        }
      }
      return TValuesToIgnore.has(value[T]) ? _.omit(value, T) : {
        [value[T]]: _.omit(value, T),
      }
    }
    return value
  }
  if (isString(value) && value.startsWith('custcollectiontranslations')) {
    const nameParts = value.split('.')
    if (nameParts.length === 2) {
      const instanceElemId = new ElemID(NETSUITE, 'translationcollection', 'instance', nameParts[0])
      const fullName = instanceElemId.getFullName()
      const instance = await elementsSource.get(instanceElemId)
        ?? elements.find(e => e.elemID.getFullName() === fullName) // not very officient, can I do better?
      if (instance && instance.value?.strings?.string?.[nameParts[1]]?.scriptid !== undefined) {
        return new ReferenceExpression(instanceElemId.createNestedID('strings', 'string', nameParts[1], 'scriptid'))
      }
    }
  }
  if (fieldType?.elemID.isEqual(BuiltinTypes.STRING.elemID)) {
    return String(value)
  }
  return value
}

const createAnalyticsInstances = async (
  instance: InstanceElement,
  elementsSource: ReadOnlyElementsSource,
  elements: Element[],
  analyticsType: ObjectType,
): Promise<InstanceElement> => {
  const definitionValues = _.omit(parse(instance.value.definition, {
    attributeNamePrefix: ATTRIBUTE_PREFIX,
    ignoreAttributes: false,
    tagValueProcessor: val => decode(val),
  }).root, 'name')

  const updatedValues = await transformValues({
    values: definitionValues,
    type: analyticsType,
    transformFunc: args => fetchTransformFunc(args, elementsSource, elements, analyticsType),
    strict: false,
    pathID: instance.elemID,
    allowEmpty: false,
  })

  if (updatedValues !== undefined) {
    instance.value = {
      ..._.omit(instance.value, 'definition'),
      ..._.omit(updatedValues, 'name'),
    }
  }

  return instance
}

const createEmptyObjectOfType = async (fieldType: ObjectType, key: string): Promise<Value> => {
  if (DEFAULT_VALUE in fieldType.fields[key].annotations) {
    return fieldType.fields[key].annotations[DEFAULT_VALUE]
  }
  const keyType = await fieldType.fields[key].getType()
  const arrayObject = {
    [TYPE]: 'array',
  }
  const nullObject = {
    [TYPE]: 'null',
  }
  if (isContainerType(keyType)) {
    // we only have lists in the types
    return arrayObject
  }

  if (isPrimitiveType(keyType)
    || (XML_TYPE in keyType.annotations && !(IGNORE_T_VALUE in keyType.annotations))) {
    return nullObject
  }

  const innerKeys = Object.keys(keyType.fields)
  const newObject: Values = {}
  await awu(innerKeys)
    .forEach(async innerKey => {
      if (!(DO_NOT_ADD in keyType.fields[innerKey].annotations)) {
        newObject[innerKey] = await createEmptyObjectOfType(keyType, innerKey)
      }
    })

  // object that contains only nulls should be null
  if (Object.values(newObject).every(val =>
    _.isEqual(val, nullObject)
    || _.isEqual(val, arrayObject))) {
    return nullObject
  }
  return newObject
}

const checkReferenceToTranslation = (name: string): boolean => {
  const regex = /^netsuite.translationcollection.instance.\w+.strings.string.\w+.scriptid$/
  return regex.test(name)
}

const deployTransformFunc = async (
  { value, field, path }: TransformFuncArgs,
  analyticsType: ObjectType,
): Promise<Value> => {
  const fieldType = (path?.getFullName().split('.').length === 4) ? analyticsType : await field?.getType()
  if (isObjectType(fieldType) && isPlainObject(value) && !(TYPE in value)) {
    if (XML_TYPE in fieldType.annotations && Object.keys(value).length === 1) {
      // eslint-disable-next-line prefer-destructuring
      value[T] = Object.keys(value)[0]
    } else {
      await awu(Object.keys(fieldType.fields))
        .filter(key => !(key in value) && fieldType.fields[key].annotations[DO_NOT_ADD] !== true)
        .forEach(async key => {
          if (DEFAULT_VALUE in fieldType.fields[key].annotations) {
            value[key] = fieldType.fields[key].annotations[DEFAULT_VALUE]
          } else {
            value[key] = await createEmptyObjectOfType(fieldType, key)
          }
        })
    }
  }
  return value
}
const checkReference = (key: string, value: Value): Value => {
  if (key === 'translationScriptId' && isReferenceExpression(value[key])) {
    const name = value[key].elemID.getFullName()
    if (checkReferenceToTranslation(name)) {
      const nameList = name.split('.')
      return nameList[3].concat('.', nameList[6])
    }
    return name
  }
  return value[key]
}

const checkTypeField = (key: string | number, value: Value): Value => {
  if (Array.isArray(value[key])) {
    return {
      [TYPE]: 'array',
      [ITEM]: value[key],
    }
  }
  if (isBoolean(value[key])) {
    // eslint-disable-next-line no-param-reassign
    return {
      [TYPE]: 'boolean',
      [TEXT]: String(value[key]),
    }
  }
  if (isString(value[key]) && isNumberStr(value[key])) {
    return {
      [TYPE]: 'string',
      [TEXT]: String(value[key]),
    }
  }
  return value[key]
}

const checkT = (key: string | number, value: Value): Value => {
  if (isString(key) && keysToAddT.has(key)) {
    return {
      [T]: key,
      ...value[key],
    }
  }
  const innerVal = value[key]
  if (isPlainObject(innerVal)) {
    const innerkeys = Object.keys(innerVal)
    if (innerkeys.includes('xmlType')) {
      innerVal[T] = innerVal.xmlType
      delete innerVal.xmlType
    } else if (innerkeys.length === 2 && innerkeys.includes(T)) {
      const otherKey = innerkeys.filter(innerKey => innerKey !== T)[0]
      return {
        [T]: innerVal[T],
        ...innerVal[otherKey],
      }
    }
  }
  return value[key]
}

const deployWalkFunc: WalkOnFunc = ({ value }) => {
  if (isPlainObject(value)) {
    const keys = Object.keys(value)

    keys.forEach(key => {
      value[key] = checkT(key, value)
      value[key] = checkReference(key, value)
    })

    // to prevent endless recursion in children arrays
    if (!(TYPE in value)) {
      keys.forEach(key => {
        value[key] = checkTypeField(key, value)
      })
    }
  } else if (Array.isArray(value)) {
    value.forEach((_val, index) => {
      value[index] = checkT(index, value)
      value[index] = checkTypeField(index, value)
    })
  }
  return WALK_NEXT_STEP.RECURSE
}

const matchToXmlObjectForm = (instance: InstanceElement, definitionValues: Values): void =>
  walkOnValue({
    elemId: instance.elemID,
    value: definitionValues,
    func: deployWalkFunc,
  })

const addMissingFields = async (
  instance: InstanceElement,
  definitionValues: Values,
  analyticsType: ObjectType,
): Promise<Values> =>
  await transformValues({
    values: definitionValues,
    type: analyticsType,
    transformFunc: args => deployTransformFunc(args, analyticsType),
    strict: false,
    pathID: instance.elemID,
  }) ?? definitionValues

const createOriginalArray = (itemName: string, value: Values): Value => {
  const arrName = `${itemName}s`
  const valToReturn: Array<Values> = []
  value[arrName]?.filter(isPlainObject).forEach((val: Values) => {
    const scriptId = val[itemName]?.scriptId
    if (scriptId !== undefined) {
      valToReturn.push({
        scriptid: scriptId,
      })
    }
  })
  return valToReturn
}

const createOriginalArrays = (value: Values): Values => ({
  pivots: {
    pivot: createOriginalArray('pivot', value),
  },
  charts: {
    chart: createOriginalArray('chart', value),
  },
  tables: {
    table: createOriginalArray('dataView', value),
  },
})

const returnToOriginalShape = async (
  instance: InstanceElement,
  analyticsType: ObjectType,
): Promise<Value> => {
  const definitionValues = {
    ..._.omit(instance.value, originalFields),
  }
  const fullDefinitionValues = await addMissingFields(instance, definitionValues, analyticsType)
  matchToXmlObjectForm(instance, fullDefinitionValues)

  if (analyticsType.elemID.typeName === WORKBOOK) {
    fullDefinitionValues.Workbook[T] = 'workbook'
  } else {
    fullDefinitionValues[T] = 'dataSet'
  }

  fullDefinitionValues.name = instance.value.name
  if (isReferenceExpression(instance.value.name?.[TEXT])) {
    const name = instance.value.name[TEXT].elemID.getFullName()
    if (name !== undefined && checkReferenceToTranslation(name)) {
      const nameList = name.split('.')
      fullDefinitionValues.name = {
        translationScriptId: nameList[3].concat('.', nameList[6]),
      }
    }
  }

  // eslint-disable-next-line new-cap
  const xmlString = new j2xParser({
    attributeNamePrefix: ATTRIBUTE_PREFIX,
    format: true,
    ignoreAttributes: false,
    cdataTagName: CDATA_TAG_NAME,
    tagValueProcessor: val => encode(val.toString()),
  }).parse({ root: fullDefinitionValues })

  const arrays = (analyticsType.elemID.typeName === WORKBOOK) ? createOriginalArrays(instance.value) : []

  return {
    name: instance.value.name,
    scriptid: instance.value.scriptid,
    dependencies: instance.value.dependencies,
    definition: xmlString,
    ...arrays,
  }
}

const filterCreator: LocalFilterCreator = ({ elementsSource }) => ({
  name: 'parseAnalytics',
  onFetch: async elements => {
    const changeType = async ({ type: analyticType, innerTypes }: TypeAndInnerTypes): Promise<void> => {
      _.remove(elements, e => isObjectType(e) && e.elemID.typeName === analyticType.elemID.name)
      _.remove(elements, e => isObjectType(e) && e.elemID.name.startsWith(analyticType.elemID.name))
      const analyticInstances = _.remove(elements, elem =>
        isInstanceElement(elem) && elem.elemID.typeName === analyticType.elemID.name)
      elements.push(analyticType)
      elements.push(...Object.values(innerTypes))
      const parsedAnalyticInstances = (
        analyticInstances
          .filter(isInstanceElement)
          .map(instance => cloneReportInstance(instance, analyticType))
          .map(instance => createAnalyticsInstances(instance, elementsSource, elements, analyticType)))
      elements.push(...await Promise.all(parsedAnalyticInstances))
    }
    // workbooks
    await changeType(ParsedWorkbookType())

    // datasets
    await changeType(ParsedDatasetType())
  },

  preDeploy: async (changes: Change[]) => {
    const instanceElems = changes
      .filter(isInstanceChange)
      .map(getChangeData)

    await awu(instanceElems)
      .filter(instance => instance.elemID.typeName === DATASET)
      .forEach(async instance => {
        instance.value = await returnToOriginalShape(instance, ParsedDatasetType().type)
      })

    await awu(instanceElems)
      .filter(instance => instance.elemID.typeName === WORKBOOK)
      .forEach(async instance => {
        instance.value = await returnToOriginalShape(instance, ParsedWorkbookType().type)
      })
  },
})

export default filterCreator
