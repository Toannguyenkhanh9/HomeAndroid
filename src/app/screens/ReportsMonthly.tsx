import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import Card from '../components/Card';
import { useThemeColors } from '../theme';
import { useTranslation } from 'react-i18next';
import { revenueAllApartmentsByMonth } from '../../services/rent';
import { useCurrency } from '../../utils/currency';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportsMonthly'>;

const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

export default function ReportsMonthly({ navigation }: Props) {
  const c = useThemeColors();
  const { t } = useTranslation();
  const { format } = useCurrency();

  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(thisYear);

  const data = useMemo(() => revenueAllApartmentsByMonth(year), [year]);
  const max = Math.max(1, ...data);

  return (
    <View
      style={{ flex: 1, backgroundColor: 'transparent', padding: 12, gap: 12 }}
    >
      <Card
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <TouchableOpacity
          onPress={() => setYear(y => y - 1)}
          style={{ padding: 8 }}
        >
          <Text style={{ color: c.text }}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={{ color: c.text, fontWeight: '800' }}>
          {t('reports.monthly')} • {year}
        </Text>
        <TouchableOpacity
          onPress={() => setYear(y => y + 1)}
          style={{ padding: 8 }}
        >
          <Text style={{ color: c.text }}>{'›'}</Text>
        </TouchableOpacity>
      </Card>

      <Card>
        <Text style={{ color: c.subtext }}>
          {t('reports.tapMonthToSeeBreakdown')}
        </Text>
      </Card>

      {/* Biểu đồ cột thuần RN */}
      <Card>
        <View
          style={{ height: 260, position: 'relative', paddingVertical: 12 }}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 12 + p * (260 - 12 - 24),
                height: 1,
                backgroundColor: '#2a2f3a',
                opacity: 0.35,
              }}
            />
          ))}

          <View
            style={{
              position: 'absolute',
              left: 8,
              right: 8,
              top: 12,
              bottom: 24,
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
            }}
          >
            {data.map((v, i) => {
              const h = Math.max(2, Math.round((v / max) * 190));
              return (
                <View key={i} style={{ alignItems: 'center', width: 22 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() =>
                      (navigation as any).navigate('ReportMonthDetail', {
                        year,
                        month: i + 1,
                      })
                    }
                    style={{
                      width: 18,
                      height: h,
                      borderTopLeftRadius: 8,
                      borderTopRightRadius: 8,
                      backgroundColor: '#22C55E',
                    }}
                  />
                  {v > 0 ? (
                    <Text
                      numberOfLines={1}
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        color: c.subtext,
                        maxWidth: 60,
                      }}
                    >
                      {format(v)}
                    </Text>
                  ) : (
                    <View style={{ height: 15, marginTop: 4 }} />
                  )}
                  <Text
                    style={{ fontSize: 12, color: c.subtext, marginTop: 2 }}
                  >
                    {MONTHS[i]}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </Card>

      <Card>
        <Text style={{ color: c.text, fontWeight: '700', marginBottom: 6 }}>
          {t('reports.summary')}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            borderTopWidth: 1,
            borderLeftWidth: 1,
            borderColor: '#ddd',
          }}
        >
          {data.map((v, i) => (
            <View
              key={i}
              style={{
                width: '33.33%', // 3 cột đều nhau
                borderRightWidth: 1,
                borderBottomWidth: 1,
                borderColor: '#ddd',
                padding: 8,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: c.subtext, fontSize: 12, marginBottom: 4 }}>
                  {t('month')} {MONTHS[i]}
              </Text>
              <Text style={{ color: c.text, fontWeight: '600' }}>
                {format(v)}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}
