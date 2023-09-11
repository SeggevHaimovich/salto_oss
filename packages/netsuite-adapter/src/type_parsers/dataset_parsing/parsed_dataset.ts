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
import { BuiltinTypes, CORE_ANNOTATIONS, ElemID, ObjectType, createRestriction, ListType, Value, createRefToElmWithValue } from '@salto-io/adapter-api'
import { createMatchingObjectType } from '@salto-io/adapter-utils'
import { TypeAndInnerTypes } from '../../types/object_types'
import * as constants from '../../constants'
import { fieldTypes } from '../../types/field_types'

// can't deploy ownerId - do strange thing (change and stay after fetch, doesn't change the owner in the UI)

// TODO change all this to just string
// TODO add all the options to all
export const codeList = ['AND', 'OR',
  'ANY_OF',
  'EMPTY', 'EMPTY_NOT', 'CONTAIN', 'CONTAIN_NOT', 'ENDWITH', 'ENDWITH_NOT', 'IS', 'IS_NOT', 'START_WITH', 'START_WITH_NOT',
  'LESS', 'GREATER', 'EQUAL', 'EQUAL_NOT', 'GREATER_OR_EQUAL', 'LESS_OR_EQUAL', 'BETWEEN', 'BETWEEN_NOT'] as const
const targetFieldContextNameList = ['DEFAULT', 'IDENTIFIER', 'UNCONSOLIDATED', 'HIERARCHY_IDENTIFIER'] as const
export const formulaDataTypeList = ['INTEGER', 'BOOLEAN', 'DATE', 'DATETIME', 'FLOAT', 'STRING', 'CLOBTEXT', 'PERCENT', 'DURATION'] as const
export const validityList = ['VALID'] // ????? could it be something else?

// should I just use string?
type Code = typeof codeList[number]
type TargetFieldContextName = typeof targetFieldContextNameList[number]
type FormulaDataType = typeof formulaDataTypeList[number]
type Validity = typeof validityList[number]

type AudienceItem = Value
type FieldReferenceJoinTrailJoin = Value
type ExpressionSubType = Value
type ExpressionUiData = Value

// maybe we should ignore these values
export type ApplicationId = Value
export type DefinitionId = Value
export type DefinitionScriptId = Value

export type Dependencies = {
  dependency: string[]
}

export type Audience = {
  AudienceItems?: AudienceItem[]
  isPublic?: boolean
}

export type BaseRecord = {
  id?: string
  label?: string
}

export type TranslationType = {
  translationScriptId?: string
}

export type JoinTrail = {
  baseRecord?: BaseRecord
  joins?: FieldReferenceJoinTrailJoin[]
}

export type FieldReference = {
  id?: string
  joinTrail?: JoinTrail
  label?: string
  uniqueId?: string
  fieldValidityState?: Validity
}

export type FormulaFormula = {
  dataType?: FormulaDataType
  formulaSQL?: string
  id?: string
  label?: TranslationType
  uniqueId?: string
}

export type Formula = {
  // eslint-disable-next-line no-use-before-define
  fields?: FieldOrFormula[]
  formula?: FormulaFormula
}

export type FieldOrFormula = {
  fieldReference?: FieldReference
  dataSetFormula?: Formula
}

export type Column = {
  alias?: string
  columnId?: number
  field?: FieldOrFormula
  label?: TranslationType
}
export type ExpressionValue = {
  type?: string
  value?: Value
}

export type Expression = {
  label?: string
  subType?: ExpressionSubType
  uiData?: ExpressionUiData[]
  value?: ExpressionValue
}

export type Operator = {
  code?: Code
}

type TargetFieldContext = {
  name?: TargetFieldContextName
}

export type Meta = {
  selectorType?: string
  subType?: string
}

export type Filter = {
  caseSensitive?: boolean
  expressions?: Expression[]
  field?: FieldOrFormula
  fieldStateName?: string
  meta?: Meta
  operator?: Operator
  targetFieldContext?: TargetFieldContext
}

export type Condition = {
  operator?: Operator
  // eslint-disable-next-line no-use-before-define
  children?: ConditionOrFilter[]
  targetFieldContext?: TargetFieldContext
  meta?: Meta
  field?: FieldOrFormula
  fieldStateName?: string
}

export type ConditionOrFilter = {
  condition?: Condition
  filter?: Filter
}

type DatasetDefinitionType = {
  applicationId?: ApplicationId
  audience?: Audience
  baseRecord?: BaseRecord
  columns?: Column[]
  criteria?: ConditionOrFilter
  description?: TranslationType
  formulas?: Formula[]
  id?: DefinitionId
  ownerId?: number
  scriptId?: DefinitionScriptId
  version?: string
}

export type ParsedDataset = {
  scriptid: string
  name: string
  dependencies?: {
    dependency?: string[]
  }
  definition?: string
} & DatasetDefinitionType

export const ParsedDatasetType = (): TypeAndInnerTypes => {
  const innerTypes: Record<string, ObjectType> = {}

  const datasetAudienceElemID = new ElemID(constants.NETSUITE, 'dataset_audience')
  const datasetAudience = createMatchingObjectType<Audience>({
    elemID: datasetAudienceElemID,
    annotations: {
    },
    fields: {
      AudienceItems: { refType: new ListType(BuiltinTypes.UNKNOWN) },
      isPublic: { refType: BuiltinTypes.BOOLEAN },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.audience = datasetAudience

  const datasetDependenciesElemID = new ElemID(constants.NETSUITE, 'dataset_dependencies')
  const datasetDependencies = createMatchingObjectType<Dependencies>({
    elemID: datasetDependenciesElemID,
    annotations: {
    },
    fields: {
      dependency: {
        refType: new ListType(BuiltinTypes.STRING),
        annotations: {
          _required: true,
        },
      },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.dependencies = datasetDependencies

  const datasetBaseRecordElemID = new ElemID(constants.NETSUITE, 'dataset_baseRecord')
  const datasetBaseRecord = createMatchingObjectType<BaseRecord>({
    elemID: datasetBaseRecordElemID,
    annotations: {
    },
    fields: {
      id: { refType: BuiltinTypes.STRING },
      label: { refType: BuiltinTypes.STRING },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.baseRecord = datasetBaseRecord

  const datasetJoinTrailElemID = new ElemID(constants.NETSUITE, 'dataset_joinTrail')
  const datasetJoinTrail = createMatchingObjectType<JoinTrail>({
    elemID: datasetJoinTrailElemID,
    annotations: {
    },
    fields: {
      baseRecord: { refType: datasetBaseRecord },
      joins: { refType: new ListType(BuiltinTypes.UNKNOWN) },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.joinTrail = datasetJoinTrail

  const datasetFieldReferenceElemID = new ElemID(constants.NETSUITE, 'dataset_fieldReference')
  const datasetFieldReference = createMatchingObjectType<FieldReference>({
    elemID: datasetFieldReferenceElemID,
    annotations: {
    },
    fields: {
      id: { refType: BuiltinTypes.STRING },
      joinTrail: { refType: datasetJoinTrail },
      label: { refType: BuiltinTypes.STRING },
      uniqueId: { refType: BuiltinTypes.STRING },
      fieldValidityState: {
        refType: BuiltinTypes.STRING,
        annotations: {
          [CORE_ANNOTATIONS.RESTRICTION]: createRestriction({ values: validityList }),
          DO_NOT_ADD: true,
        },
      },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.fieldReference = datasetFieldReference

  const datasetTranslationElemID = new ElemID(constants.NETSUITE, 'dataset_translation')
  const datasetTranslation = createMatchingObjectType<TranslationType>({
    elemID: datasetTranslationElemID,
    annotations: {
    },
    fields: {
      translationScriptId: { refType: BuiltinTypes.STRING },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.datasetTranslation = datasetTranslation

  const datasetFormulaFormulaElemID = new ElemID(constants.NETSUITE, 'dataset_formula_formula')
  const datasetFormulaFormula = createMatchingObjectType<FormulaFormula>({
    elemID: datasetFormulaFormulaElemID,
    annotations: {
      XML_TYPE: true,
    },
    fields: {
      dataType: {
        refType: BuiltinTypes.STRING,
        annotations: {
          [CORE_ANNOTATIONS.RESTRICTION]: createRestriction({ values: formulaDataTypeList }),
        },
      },
      formulaSQL: { refType: BuiltinTypes.STRING },
      id: { refType: BuiltinTypes.STRING },
      label: { refType: datasetTranslation },
      uniqueId: { refType: BuiltinTypes.STRING },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.formulaFormula = datasetFormulaFormula

  const datasetFormulaElemID = new ElemID(constants.NETSUITE, 'dataset_formula')
  const datasetFormula = createMatchingObjectType<Formula>({
    elemID: datasetFormulaElemID,
    annotations: {
    },
    fields: {
      fields: { refType: BuiltinTypes.UNKNOWN },
      formula: { refType: datasetFormulaFormula },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.formula = datasetFormula

  const datasetFieldOrFormulaElemID = new ElemID(constants.NETSUITE, 'dataset_fieldOrFormula')
  const datasetFieldOrFormula = createMatchingObjectType<FieldOrFormula>({
    elemID: datasetFieldOrFormulaElemID,
    annotations: {
      XML_TYPE: true,
    },
    fields: {
      fieldReference: { refType: datasetFieldReference },
      dataSetFormula: { refType: datasetFormula },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.fieldOrFormula = datasetFieldOrFormula

  const datasetColumnElemID = new ElemID(constants.NETSUITE, 'dataset_column')
  const datasetColumn = createMatchingObjectType<Column>({
    elemID: datasetColumnElemID,
    annotations: {
    },
    fields: {
      alias: { refType: BuiltinTypes.STRING },
      columnId: { refType: BuiltinTypes.NUMBER },
      field: { refType: datasetFieldOrFormula },
      label: { refType: datasetTranslation },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.column = datasetColumn

  const expressionValueElemID = new ElemID(constants.NETSUITE, 'dataset_criteria_expression_value')
  const expressionValue = createMatchingObjectType<ExpressionValue>({
    elemID: expressionValueElemID,
    annotations: {
    },
    fields: {
      type: { refType: BuiltinTypes.STRING },
      value: { refType: BuiltinTypes.UNKNOWN },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.expressionValue = expressionValue

  const expressionElemID = new ElemID(constants.NETSUITE, 'dataset_criteria_expression')
  const expression = createMatchingObjectType<Expression>({
    elemID: expressionElemID,
    annotations: {
    },
    fields: {
      label: { refType: BuiltinTypes.STRING },
      subType: { refType: BuiltinTypes.UNKNOWN },
      uiData: { refType: new ListType(BuiltinTypes.STRING) },
      value: { refType: expressionValue },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.expression = expression

  const datasetMetaElemID = new ElemID(constants.NETSUITE, 'dataset_meta')
  const datasetMeta = createMatchingObjectType<Meta>({
    elemID: datasetMetaElemID,
    annotations: {
    },
    fields: {
      selectorType: { refType: BuiltinTypes.UNKNOWN },
      subType: { refType: BuiltinTypes.STRING },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.criteriaMeta = datasetMeta

  const datasetOperatorElemID = new ElemID(constants.NETSUITE, 'dataset_operator')
  const datasetOperator = createMatchingObjectType<Operator>({
    elemID: datasetOperatorElemID,
    annotations: {
    },
    fields: {
      code: {
        refType: BuiltinTypes.STRING,
        annotations: {
          [CORE_ANNOTATIONS.RESTRICTION]: createRestriction({ values: codeList }),
        },
      },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.operator = datasetOperator

  const datasetTargetFieldContextElemID = new ElemID(constants.NETSUITE, 'dataset_criteria_TargetFieldContext')
  const datasetTargetFieldContext = createMatchingObjectType<TargetFieldContext>({
    elemID: datasetTargetFieldContextElemID,
    annotations: {
    },
    fields: {
      name: {
        refType: BuiltinTypes.STRING,
        annotations: {
          [CORE_ANNOTATIONS.RESTRICTION]: createRestriction({ values: targetFieldContextNameList }),
        },
      },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.context = datasetTargetFieldContext

  const datasetFilterElemID = new ElemID(constants.NETSUITE, 'dataset_filter')
  const datasetFilter = createMatchingObjectType<Filter>({
    elemID: datasetFilterElemID,
    annotations: {
    },
    fields: {
      caseSensitive: { refType: BuiltinTypes.BOOLEAN },
      expressions: { refType: new ListType(expression) },
      operator: {
        refType: datasetOperator,
      },
      targetFieldContext: { refType: datasetTargetFieldContext },
      field: { refType: datasetFieldOrFormula },
      fieldStateName: { refType: BuiltinTypes.STRING },
      meta: { refType: datasetMeta },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.filter = datasetFilter

  const datasetConditionElemID = new ElemID(constants.NETSUITE, 'dataset_condition')
  const datasetCondition = createMatchingObjectType<Condition>({
    elemID: datasetConditionElemID,
    annotations: {
    },
    fields: {
      children: { refType: BuiltinTypes.UNKNOWN },
      operator: { refType: datasetOperator },
      targetFieldContext: { refType: datasetTargetFieldContext },
      meta: { refType: datasetMeta },
      field: { refType: datasetFieldOrFormula },
      fieldStateName: { refType: BuiltinTypes.STRING },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.condition = datasetCondition

  const datasetCriteriaElemID = new ElemID(constants.NETSUITE, 'dataset_criteria')
  const datasetCriteria = createMatchingObjectType<ConditionOrFilter>({
    elemID: datasetCriteriaElemID,
    annotations: {
      XML_TYPE: true,
    },
    fields: {
      condition: { refType: datasetCondition },
      filter: { refType: datasetFilter },
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  innerTypes.criteria = datasetCriteria

  datasetFormula.fields.fields.refType = createRefToElmWithValue(new ListType(datasetFieldOrFormula))
  datasetCondition.fields.children.refType = createRefToElmWithValue(new ListType(datasetCriteria))

  const datasetElemID = new ElemID(constants.NETSUITE, 'dataset')
  const dataset = createMatchingObjectType<ParsedDataset>({
    elemID: datasetElemID,
    fields: {
      scriptid: {
        refType: BuiltinTypes.SERVICE_ID,
        annotations: {
          _required: true,
          [constants.IS_ATTRIBUTE]: true,
          [CORE_ANNOTATIONS.RESTRICTION]: createRestriction({ regex: '^custdataset[0-9a-z_]+' }),
        },
      },
      name: {
        refType: BuiltinTypes.STRING,
        annotations: {
          _required: true,
          [CORE_ANNOTATIONS.RESTRICTION]: createRestriction({ max_length: 50 }),
        },
      },
      dependencies: { refType: datasetDependencies },
      definition: { refType: createRefToElmWithValue(fieldTypes.cdata) },
      applicationId: { refType: BuiltinTypes.UNKNOWN },
      audience: { refType: datasetAudience },
      baseRecord: { refType: datasetBaseRecord },
      columns: { refType: new ListType(datasetColumn) },
      criteria: { refType: datasetCriteria },
      description: { refType: datasetTranslation },
      formulas: { refType: new ListType(datasetFieldOrFormula) },
      id: { refType: BuiltinTypes.UNKNOWN },
      ownerId: { refType: BuiltinTypes.NUMBER },
      version: { refType: BuiltinTypes.STRING },
      scriptId: { refType: BuiltinTypes.UNKNOWN },
    },
    annotations: {
      XML_TYPE: true,
    },
    path: [constants.NETSUITE, constants.TYPES_PATH, constants.DATASET],
  })
  return { type: dataset, innerTypes }
}
