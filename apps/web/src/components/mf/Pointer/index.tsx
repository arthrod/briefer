import React from 'react'
import styles from './index.module.scss' // 引入CSS文件

function Pointer() {
  return (
    <span className={styles.pointer}>
      <span></span>
      <span></span>
      <span></span>
    </span>
  )
}

export default Pointer
