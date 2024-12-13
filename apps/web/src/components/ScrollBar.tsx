import clsx from 'clsx'
import { ReactNode, forwardRef, useEffect, useRef } from 'react'
import SimpleBar from 'simplebar-react'

interface Props {
  children: ReactNode
  className?: string
  disabled?: boolean
  onScroll?: (event: Event) => void
  ref?: any
}
const ScrollBar = forwardRef<HTMLDivElement, Props>(function ScrollBar(props, ref) {
  return (
    <SimpleBar scrollableNodeProps={{ ref: ref }} className={clsx('no-scrollbar', props.className)}>
      {props.children}
    </SimpleBar>
  )
})

export default ScrollBar
