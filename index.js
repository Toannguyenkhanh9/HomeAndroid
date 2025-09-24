import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import {AppRegistry} from 'react-native';
import PushNotification from 'react-native-push-notification';
import App from './App';                    // <-- dùng App.tsx bạn đã tạo
import {name as appName} from './app.json';

// ⚡ Cấu hình lib notification ngay khi app khởi động
PushNotification.configure({
  onNotification: function (notification) {
    console.log('NOTIFICATION:', notification);
  },
  popInitialNotification: true,
  requestPermissions: false, // ❌ không xin quyền ở đây, để tự xử lý trong RootNavigator
});
AppRegistry.registerComponent(appName, () => App);

