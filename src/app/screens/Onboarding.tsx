// src/app/screens/Onboarding.tsx
import React, {useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import {useThemeColors} from '../theme';
import {useTranslation} from 'react-i18next';

const {width} = Dimensions.get('window');

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

// 👉 Đặt ảnh vào: src/app/assets/onboarding/
//    welcome.png, apartment.png, contract.png, settle.png, opex.png, report.png
//    Có thể thay bằng ảnh của bạn (giữ nguyên tên cho tiện).
const IMAGES = {
  welcome:   require('../assets/1home.png'),
  apartment: require('../assets/2Apartment.png'),
  contract:  require('../assets/4lease.png'),
  settle:    require('../assets/7charge.png'),
  opex:      require('../assets/operatingCosts.png'),
  report:    require('../assets/report.png'),
} as const;

type Step = { title: string; body: string; illustration?: any; placeholder?: string };

export default function Onboarding({navigation}: Props) {
  const c = useThemeColors();
  const {t} = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  // Lấy dữ liệu steps từ file dịch
  const STEPS: Step[] = useMemo(() => ([
    {
      title: t('onboarding.steps.0.title'),
      body: t('onboarding.steps.0.body'),
      illustration: IMAGES.welcome,
      placeholder: '👋',
    },
    {
      title: t('onboarding.steps.1.title'),
      body: t('onboarding.steps.1.body'),
      illustration: IMAGES.apartment,
      placeholder: '🏢',
    },
    {
      title: t('onboarding.steps.2.title'),
      body: t('onboarding.steps.2.body'),
      illustration: IMAGES.contract,
      placeholder: '📄',
    },
    {
      title: t('onboarding.steps.3.title'),
      body: t('onboarding.steps.3.body'),
      illustration: IMAGES.settle,
      placeholder: '🧾',
    },
    {
      title: t('onboarding.steps.4.title'),
      body: t('onboarding.steps.4.body'),
      illustration: IMAGES.opex,
      placeholder: '🧰',
    },
    {
      title: t('onboarding.steps.5.title'),
      body: t('onboarding.steps.5.body'),
      illustration: IMAGES.report,
      placeholder: '📊',
    },
  ]), [t]);

  const go = (to: number) => {
    setIndex(to);
    scrollRef.current?.scrollTo({x: to * width, animated: true});
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(i);
  };

  const dots = useMemo(
    () => (
      <View style={{flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12}}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === index ? 22 : 8,
              height: 8,
              borderRadius: 999,
              backgroundColor: i === index ? '#22C55E' : '#2A2F3A',
            }}
          />
        ))}
      </View>
    ),
    [index, STEPS.length],
  );

  const finish = async () => {
    await AsyncStorage.setItem('has_seen_onboarding', '1');
    navigation.reset({index: 0, routes: [{name: 'ApartmentsList'}]});
  };

  return (
    <View style={{flex: 1, backgroundColor: 'transparent', paddingTop: 16}}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
      >
        {STEPS.map((s, i) => (
          <View key={i} style={{width, paddingHorizontal: 20}}>
            <View
              style={{
                marginTop: 32,
                borderRadius: 16,
                backgroundColor: c.card,
                padding: 20,
              }}
            >
              <Text style={{color: c.text, fontWeight: '800', fontSize: 20, marginBottom: 10}}>
                {s.title}
              </Text>
              <Text style={{color: c.subtext, fontSize: 16, lineHeight: 22}}>
                {s.body}
              </Text>

              {/* Minh hoạ bên dưới đoạn mô tả */}
              <View
                style={{
                  marginTop: 16,
                  borderRadius: 14,
                  overflow: 'hidden',
                }}
              >
                {s.illustration ? (
                  <Image
                    source={s.illustration}
                    resizeMode="cover"
                    style={{width: '100%', height: 600}}
                  />
                ) : (
                  <View
                    style={{
                      width: '100%',
                      height: 200,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#101826',
                    }}
                  >
                    <Text style={{fontSize: 48}}>{s.placeholder ?? '⭐'}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {dots}

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          marginTop: 16,
        }}
      >
        <TouchableOpacity
          onPress={finish}
          style={{
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderColor: '#2A2F3A',
          }}
        >
          <Text style={{color: c.text, fontWeight: '700'}}>{t('onboarding.skip')}</Text>
        </TouchableOpacity>

        {index < STEPS.length - 1 ? (
          <TouchableOpacity
            onPress={() => go(index + 1)}
            style={{
              backgroundColor: '#22C55E',
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 10,
            }}
          >
            <Text style={{color: '#0B1220', fontWeight: '800'}}>{t('onboarding.next')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={finish}
            style={{
              backgroundColor: '#22C55E',
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 10,
            }}
          >
            <Text style={{color: '#0B1220', fontWeight: '800'}}>{t('onboarding.start')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{height: 20}} />
    </View>
  );
}
