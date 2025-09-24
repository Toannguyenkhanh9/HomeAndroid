import PushNotification from 'react-native-push-notification';

const CHANNEL_ID = 'rent_reminders';

export function initNotifications() {
  PushNotification.createChannel(
    { channelId: CHANNEL_ID, channelName: 'Rent Reminders', importance: 4 },
    () => {}
  );
}

export function scheduleReminder(
  id: string,
  title: string,
  message: string,
  dateISO: string
) {
  const date = new Date(dateISO);
  date.setHours(9, 0, 0, 0);            // 9:00 sáng theo giờ máy
  if (date.getTime() <= Date.now()) return;

  PushNotification.localNotificationSchedule({
    channelId: CHANNEL_ID,
    id,
    title,
    message,
    date,
    allowWhileIdle: true,
    playSound: true,
    importance: 'high',
  });
}

export function cancelReminder(id: string) {
  try {
    // bản mới
    // @ts-ignore
    PushNotification.cancelLocalNotification(id);
  } catch {
    // bản cũ
    PushNotification.cancelLocalNotifications({ id });
  }
}
