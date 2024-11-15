import React from 'react';
import styles from './index.module.scss';  // 引入CSS文件

function Spinner() {
  return (
    <div className={styles.spinner_container}>
      <div className={styles.spinner}></div>
    </div>
  );
}

export default Spinner;
