import LoadingIcon from '@/icons/loading-circle.svg'
import styles from './index.module.scss'
export const LoadingCircle = () => {
  return (
    <span className={styles['loading-circle']}>
      <LoadingIcon />
    </span>
  )
}
