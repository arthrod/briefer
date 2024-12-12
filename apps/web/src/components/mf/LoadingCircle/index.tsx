import LoadingIcon from '@/icons/loading-circle.svg'
import styles from './index.module.scss'
import clsx from 'clsx'
interface Props {
  size?: 'sm' | 'md'
}
export const LoadingCircle = ({ size = 'md' }: Props) => {
  return (
    <span className={clsx(styles['loading-circle'], styles[`${size}`])}>
      <LoadingIcon />
    </span>
  )
}
