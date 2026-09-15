import { type FieldReducerInfo, type StandardEditorProps } from '@grafana/data';
import { StatsPicker } from '@grafana/ui';
import React from 'react';

/** Reducers that do not return one number. */
const NON_SCALAR_REDUCERS = new Set(['allValues', 'uniqueValues', 'allIsNull', 'allIsZero']);

/** Keep every reducer whose result is a single number. */
const isScalarReducer = (reducer: FieldReducerInfo) => !NON_SCALAR_REDUCERS.has(reducer.id);

/** Relations calculation picker. */
export const RelationsStatsPicker: React.FC<StandardEditorProps<string[]>> = ({ value, onChange }) => (
  <StatsPicker stats={value ?? []} onChange={onChange} allowMultiple width="auto" filterOptions={isScalarReducer} />
);
