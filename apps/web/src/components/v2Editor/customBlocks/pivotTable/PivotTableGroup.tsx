import AxisModifierSelector from '@/components/AxisModifierSelector'
import AxisSelector from '@/components/AxisSelector'
import {
  AggregateFunction,
  DataFrame,
  DataFrameColumn,
  NumpyNumberTypes,
  NumpyTimeDeltaTypes,
} from '@briefer/types'
import { useCallback } from 'react'

interface Props<T> {
  dataframe: DataFrame | null
  label: string
  addLabel: string
  values: T[]
  valueLabel: (value: T, index: number) => string
  onChange: (values: T[]) => void
  onAdd: () => void
  onRemove: (index: number) => void
  isEditable: boolean
}
function PivotTableGroup<
  T extends
    | { column: DataFrameColumn | null }
    | { column: DataFrameColumn | null; aggregateFunction: AggregateFunction },
>(props: Props<T>) {
  const onChangeColumn = useCallback(
    (column: DataFrameColumn | null, index: number) => {
      const values = props.values.map((r, i) => (i === index ? { ...r, column } : r))
      props.onChange(values)
    },
    [props.values, props.onChange]
  )

  const onChangeAggregateFunction = useCallback(
    (aggregateFunction: string | null, index: number) => {
      const values = props.values.map((r, i) => (i === index ? { ...r, aggregateFunction } : r))
      props.onChange(values)
    },
    [props.values, props.onChange]
  )

  return (
    <div>
      <div className="flex items-end justify-between pb-1">
        <div className="text-md font-medium leading-6 text-gray-900">{props.label}</div>
        <button
          className="pb-0.5 text-[10px] text-gray-400 underline hover:text-gray-500"
          onClick={props.onAdd}>
          {props.addLabel}
        </button>
      </div>
      <div className="flex flex-col space-y-6">
        {props.values.map((r, i) => (
          <div key={String(i)} className="group relative flex flex-col items-end space-x-1">
            <div className="w-full">
              <AxisSelector
                label={props.valueLabel(r, i)}
                value={r.column}
                columns={props.dataframe?.columns ?? []}
                onChange={(c) => onChangeColumn(c, i)}
                disabled={!props.dataframe || !props.isEditable}
                defaultValue={null}
              />
            </div>

            {r.column && 'aggregateFunction' in r && (
              <div className="w-full pt-1">
                <AxisModifierSelector
                  label="Aggregate"
                  value={r.aggregateFunction}
                  options={
                    NumpyNumberTypes.or(NumpyTimeDeltaTypes).safeParse(r.column.type).success
                      ? [
                          { name: 'Sum', value: 'sum' },
                          { name: 'Average', value: 'mean' },
                          { name: 'Median', value: 'median' },
                          { name: 'Min', value: 'min' },
                          { name: 'Max', value: 'max' },
                          { name: 'Count', value: 'count' },
                        ]
                      : [{ name: 'Count', value: 'count' }]
                  }
                  onChange={(agg) => onChangeAggregateFunction(agg, i)}
                  disabled={!props.dataframe || !props.isEditable}
                />
              </div>
            )}

            {props.values.length > 1 && (
              <button
                className="jutify-center absolute right-1 top-1 flex cursor-pointer items-center text-[10px] text-gray-400 underline hover:text-red-600"
                onClick={() => props.onRemove(i)}>
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default PivotTableGroup
