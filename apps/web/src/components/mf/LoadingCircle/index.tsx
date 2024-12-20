import LoadingIcon from '@/icons/loading-circle.svg'
import styles from './index.module.scss'
import clsx from 'clsx'
interface Props {
  size?: 'sm' | 'md'
  style?: React.CSSProperties
}
export const LoadingCircle = ({ size = 'md', style }: Props) => {
  return (
    <span className={clsx(styles['loading-circle'], styles[`${size}`])} style={style}>
      <LoadingIcon />
    </span>
  )
}
