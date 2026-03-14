import React from 'react';

import styles from './index.module.scss';

const Component = () => {
  return (
    <div className={styles.background}>
      <div className={styles.autoWrapper2}>
        <div className={styles.autoWrapper}>
          <p className={styles.text}>今日罢工</p>
          <p className={styles.a0}>0</p>
        </div>
        <img src="../image/mmarl1eh-0azistu.svg" className={styles.group41} />
      </div>
      <div className={styles.rectangle102}>
        <p className={styles.text2}>今日无罢工</p>
      </div>
    </div>
  );
}

export default Component;
