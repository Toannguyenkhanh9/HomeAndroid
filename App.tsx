import React from 'react';
import {StatusBar, useColorScheme} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

// Settings + i18n
import {SettingsProvider, useSettings} from './src/app/state/SettingsContext';
import i18n from './src/app/i18n';
import {I18nextProvider} from 'react-i18next';

// ❌ BỎ import NavigationContainer ở đây
// import {NavigationContainer} from '@react-navigation/native';

import RootNavigator from './src/app/navigation/RootNavigator';

function LanguageSync({children}: {children: React.ReactNode}) {
  const {language} = useSettings();
  React.useEffect(() => {
    if (language) i18n.changeLanguage(language);
  }, [language]);
  return <>{children}</>;
}

export default function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <I18nextProvider i18n={i18n}>
          <LanguageSync>
            {/* ❌ KHÔNG bọc NavigationContainer ở đây */}
            <RootNavigator />
          </LanguageSync>
        </I18nextProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
