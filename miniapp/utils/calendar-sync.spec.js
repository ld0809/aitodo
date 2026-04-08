const {
  buildPhoneCalendarPayload,
  normalizeCalendarErrorMessage,
  CALENDAR_AUTH_SCOPE
} = require('./calendar-sync');

describe('calendar-sync helper', () => {
  test('buildPhoneCalendarPayload should convert dueAt into unix timestamps', () => {
    const payload = buildPhoneCalendarPayload({
      content: '同步到手机日历',
      dueAt: '2026-04-08T08:30:00.000Z'
    });

    expect(payload).toEqual({
      title: '同步到手机日历',
      startTime: 1775637000,
      endTime: 1775637060,
      description: '来自 AI待办 小程序同步'
    });
  });

  test('buildPhoneCalendarPayload should reject invalid dueAt', () => {
    expect(() =>
      buildPhoneCalendarPayload({
        content: '无效时间',
        dueAt: 'not-a-date'
      }),
    ).toThrow('invalid dueAt');
  });

  test('normalizeCalendarErrorMessage should map scope denial to actionable text', () => {
    const message = normalizeCalendarErrorMessage({
      errMsg: `authorize:fail auth deny, scope=${CALENDAR_AUTH_SCOPE}`
    });

    expect(message).toBe('请在小程序设置中开启“写入手机日历”权限后重试');
  });
});
