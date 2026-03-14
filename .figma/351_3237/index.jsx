import React from 'react';

import styles from './index.module.scss';

const Component = () => {
  return (
    <div className={styles.background}>
      <div className={styles.autoWrapper2}>
        <div className={styles.autoWrapper}>
          <p className={styles.text}>今日罢工</p>
          <p className={styles.a3}>3</p>
        </div>
        <div className={styles.notes}>
          <p className={styles.text2}>火车罢工（国家铁路局）</p>
          <p className={styles.a07001000}>07:00 - 10：00</p>
        </div>
      </div>
      <div className={styles.separator} />
      <div className={styles.notes2}>
        <p className={styles.text2}>地铁罢工（ATM）</p>
        <p className={styles.a07001000}>00：00- 24：00</p>
      </div>
      <div className={styles.autoWrapper4}>
        <img src="../image/mmarl1e8-aoc2va2.svg" className={styles.group41} />
        <div className={styles.autoWrapper3}>
          <div className={styles.separator2} />
          <p className={styles.text3}>机场罢工（机场地勤人员 / 阿...</p>
        </div>
      </div>
    </div>
  );
}

export default Component;
