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

const {width} = Dimensions.get('window');

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

// 👉 Đặt ảnh vào: src/app/assets/onboarding/
//    welcome.png, apartment.png, contract.png, settle.png, opex.png, report.png
//    Có thể thay bằng ảnh của bạn (giữ nguyên tên cho tiện).
const IMAGES = {
  welcome:   require('../assets/onboarding/welcome.png'),
  apartment: require('../assets/onboarding/apartment.png'),
  contract:  require('../assets/onboarding/contract.png'),
  settle:    require('../assets/onboarding/settle.png'),
  opex:      require('../assets/onboarding/opex.png'),
  report:    require('../assets/onboarding/report.png'),
} as const;

type Step = { title: string; body: string; illustration?: any; placeholder?: string };

const STEPS: Step[] = [
  {
    title: 'Chào mừng!',
    body:
      'Ứng dụng giúp bạn quản lý căn hộ/phòng trọ: hợp đồng, chu kỳ thuê, hoá đơn, chi phí hoạt động và báo cáo.',
    illustration: IMAGES.welcome,
    placeholder: '👋',
  },
  {
    title: 'Bước 1 — Tạo căn hộ',
    body: 'Vào “Căn hộ” → thêm căn hộ. Sau đó vào căn hộ để thêm các phòng.',
    illustration: IMAGES.apartment,
    placeholder: '🏢',
  },
  {
    title: 'Bước 2 — Tạo hợp đồng',
    body: 'Vào chi tiết phòng → “Tạo hợp đồng”. Chọn chu kỳ, giá cơ bản và các khoản phí.',
    illustration: IMAGES.contract,
    placeholder: '📄',
  },
  {
    title: 'Bước 3 — Tất toán chu kỳ',
    body: 'Mỗi chu kỳ: nhập số công tơ (điện nước) và phụ phí phát sinh → tất toán để sinh hoá đơn.',
    illustration: IMAGES.settle,
    placeholder: '🧾',
  },
  {
    title: 'Chi phí hoạt động',
    body: 'Cài đặt chi phí cố định/không cố định cho căn hộ. Vào từng tháng để nhập và lưu.',
    illustration: IMAGES.opex,
    placeholder: '🧰',
  },
  {
    title: 'Báo cáo',
    body: 'Xem thu theo phòng và chi của căn hộ trong khoảng ngày → ra số dư cuối kỳ.',
    illustration: IMAGES.report,
    placeholder: '📊',
  },
];

export default function Onboarding({navigation}: Props) {
  const c = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

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
    [index],
  );

  const finish = async () => {
    await AsyncStorage.setItem('has_seen_onboarding', '1');
    navigation.reset({index: 0, routes: [{name: 'ApartmentsList'}]});
  };

  return (
    <View style={{flex: 1, backgroundColor: c.bg, paddingTop: 16}}>
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
                borderWidth: 1,
                borderColor: '#263042',
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
                  borderWidth: 1,
                  borderColor: '#2A2F3A',
                }}
              >
                {s.illustration ? (
                  <Image
                    source={s.illustration}
                    resizeMode="cover"
                    style={{width: '100%', height: 200}}
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
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#2A2F3A',
          }}
        >
          <Text style={{color: c.text, fontWeight: '700'}}>Bỏ qua</Text>
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
            <Text style={{color: '#0B1220', fontWeight: '800'}}>Tiếp</Text>
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
            <Text style={{color: '#0B1220', fontWeight: '800'}}>Bắt đầu</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{height: 20}} />
    </View>
  );
}
