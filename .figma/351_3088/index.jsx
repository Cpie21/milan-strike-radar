import React from 'react';

import styles from './index.module.scss';

const Component = () => {
  return (
    <div className={styles.background}>
      <div className={styles.autoWrapper}>
        <img src="../image/mmd8lyrk-eimb6pc.svg" className={styles.group41} />
        <div className={styles.ellipse47} />
        <div className={styles.notes}>
          <p className={styles.text}>火车罢工（国家铁路局）</p>
          <p className={styles.a07001000}>07:00 - 10：00</p>
        </div>
      </div>
      <div className={styles.separator} />
      <div className={styles.autoWrapper4}>
        <p className={styles.a3}>3</p>
        <div className={styles.autoWrapper3}>
          <div className={styles.autoWrapper2}>
            <div className={styles.ellipse48} />
            <div className={styles.notes2}>
              <p className={styles.text}>地铁罢工（ATM）</p>
              <p className={styles.a07001000}>00：00- 24：00</p>
            </div>
          </div>
          <div className={styles.separator2} />
        </div>
      </div>
      <div className={styles.autoWrapper5}>
        <p className={styles.text2}>今日罢工</p>
        <div className={styles.ellipse49} />
        <p className={styles.text3}>机场罢工（机场地勤人员 / ...</p>
      </div>
    </div>
  );
}

export default Component;
