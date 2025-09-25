// src/screens/PricingPlans.tsx
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import Card from '../components/Card';
import { useThemeColors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, any>;

type Plan = {
  id: 'free' | 'starter' | 'pro' | 'enterprise';
  name: string;
  icon: string;
  monthly: number;     // 0 = miễn phí
  yearly: number;      // 0 = miễn phí
  features: string[];
  cta: string;
  highlight?: boolean; // Pro
  contact?: boolean;   // Enterprise
};

export default function PricingPlans({}: Props) {
  const c = useThemeColors();
  const [yearly, setYearly] = useState(true);
  const [compareOpen, setCompareOpen] = useState(false);

  const plans: Plan[] = useMemo(
    () => [
      {
        id: 'free',
        name: 'Free',
        icon: '🎁',
        monthly: 0,
        yearly: 0,
        features: [
          '1 căn hộ, tối đa 5 phòng',
          'Quản lý hợp đồng cơ bản',
          'Có quảng cáo',
        ],
        cta: 'Dùng miễn phí',
      },
      {
        id: 'starter',
        name: 'Starter',
        icon: '🌱',
        monthly: 49000,
        yearly: 499000,
        features: [
          '3 căn hộ, 30 phòng',
          'Xuất PDF/Excel (có watermark)',
          'Nhắc nhở thu tiền',
          'Gỡ quảng cáo',
        ],
        cta: 'Nâng cấp Starter',
      },
      {
        id: 'pro',
        name: 'Pro',
        icon: '🚀',
        monthly: 99000,
        yearly: 999000,
        features: [
          '10 căn hộ, 100 phòng',
          'Xuất báo cáo không watermark',
          'Email notifications',
          'Thống kê nâng cao',
        ],
        cta: 'Chọn Pro',
        highlight: true,
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        icon: '🏢',
        monthly: 0,
        yearly: 0,
        features: [
          'Không giới hạn phòng',
          'Multi-branch',
          'Tích hợp thanh toán online',
          'Hỗ trợ riêng',
        ],
        cta: 'Liên hệ ngay',
        contact: true,
      },
    ],
    []
  );

  const fmt = (n: number) => {
    if (n === 0) return 'Miễn phí';
    return n.toLocaleString('vi-VN') + 'đ';
  };

  const priceLabel = (p: Plan) => {
    if (p.contact) return 'Liên hệ';
    if (yearly) return `${fmt(p.yearly)} / năm`;
    return `${fmt(p.monthly)} / tháng`;
  };

  const onSelectPlan = (p: Plan) => {
    // TODO: hook thanh toán / IAP của bạn
    // Ví dụ:
    // if (p.id === 'starter') purchase('starter_monthly' | 'starter_yearly' dựa vào yearly)
    // if (p.id === 'pro') purchase('pro_monthly' | 'pro_yearly')
    // if (p.id === 'free') setFree()
    // if (p.contact) openContact()
    console.log('select plan', p.id, yearly ? 'yearly' : 'monthly');
  };

  const onTryProTrial = () => {
    // TODO: Start trial logic
    console.log('start 7-day trial for PRO');
  };

  const restorePurchases = () => {
    // TODO: Restore purchase logic
    console.log('restore purchases');
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Card style={{ padding: 16 }}>
          <Text style={{ color: c.text, fontWeight: '800', fontSize: 18 }}>
            Chọn gói phù hợp với bạn
          </Text>
          <Text style={{ color: c.subtext, marginTop: 6 }}>
            Bắt đầu miễn phí, nâng cấp khi cần thêm tính năng.
          </Text>

          {/* Toggle Monthly / Yearly */}
          <View
            style={{
              flexDirection: 'row',
              alignSelf: 'center',
              marginTop: 12,
              backgroundColor: c.card,
              borderRadius: 999,
              padding: 4,
              gap: 4,
            }}
          >
            <TouchableOpacity
              onPress={() => setYearly(false)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 999,
                backgroundColor: yearly ? 'transparent' : '#22C55E',
              }}
            >
              <Text
                style={{
                  color: yearly ? c.text : '#fff',
                  fontWeight: '700',
                }}
              >
                Trả theo tháng
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setYearly(true)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 999,
                backgroundColor: yearly ? '#22C55E' : 'transparent',
              }}
            >
              <Text
                style={{
                  color: yearly ? '#fff' : c.text,
                  fontWeight: '700',
                }}
              >
                Trả theo năm
              </Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Plans */}
        {plans.map((p) => (
          <Card
            key={p.id}
            style={{
              borderWidth: p.highlight ? 2 : 1,
              borderColor: p.highlight ? '#22C55E' : c.card,
              shadowColor: p.highlight ? '#22C55E' : undefined,
              padding: 16,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 8,
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 20, marginRight: 8 }}>{p.icon}</Text>
                <Text
                  style={{
                    color: c.text,
                    fontWeight: '800',
                    fontSize: 18,
                  }}
                >
                  {p.name}
                </Text>
                {p.highlight ? (
                  <View
                    style={{
                      marginLeft: 8,
                      backgroundColor: '#d1fae5',
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 999,
                    }}
                  >
                    <Text style={{ color: '#065f46', fontWeight: '700' }}>
                      Phổ biến nhất
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>
                {priceLabel(p)}
              </Text>
            </View>

            {/* Features */}
            <View style={{ gap: 6, marginTop: 6 }}>
              {p.features.map((f, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: '#22C55E', marginRight: 6 }}>•</Text>
                  <Text style={{ color: c.text }}>{f}</Text>
                </View>
              ))}
            </View>

            {/* CTA */}
            <TouchableOpacity
              onPress={() => onSelectPlan(p)}
              style={{
                marginTop: 14,
                backgroundColor: p.highlight ? '#22C55E' : '#334155',
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>{p.cta}</Text>
            </TouchableOpacity>

            {/* Trial cho Pro */}
            {p.id === 'pro' ? (
              <TouchableOpacity
                onPress={onTryProTrial}
                style={{
                  marginTop: 10,
                  paddingVertical: 10,
                  borderRadius: 12,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#22C55E',
                }}
              >
                <Text style={{ color: '#22C55E', fontWeight: '700' }}>
                  Dùng thử 7 ngày (không cần thẻ)
                </Text>
              </TouchableOpacity>
            ) : null}
          </Card>
        ))}

        {/* Footer actions */}
        <Card style={{ padding: 16, gap: 10 }}>
          <TouchableOpacity onPress={() => setCompareOpen(true)}>
            <Text style={{ color: c.text, textAlign: 'center', fontWeight: '700' }}>
              Xem bảng so sánh chi tiết
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={restorePurchases}>
            <Text style={{ color: c.subtext, textAlign: 'center' }}>
              Khôi phục mua hàng
            </Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>

      {/* Comparison Modal */}
      <Modal
        visible={compareOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCompareOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: c.card,
              borderRadius: 16,
              padding: 16,
            }}
          >
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>
              So sánh tính năng
            </Text>
            <View style={{ height: 12 }} />

            {/* Bảng đơn giản (có thể nâng cấp thành Table) */}
            <ScrollView horizontal>
              <View style={{ flexDirection: 'row' }}>
                {/* Cột tiêu đề */}
                <View style={{ width: 180, paddingRight: 8 }}>
                  {[
                    'Số căn hộ',
                    'Số phòng',
                    'Xuất PDF/Excel',
                    'Watermark',
                    'Nhắc nhở thu tiền',
                    'Gỡ quảng cáo',
                    'Email notifications',
                    'Thống kê nâng cao',
                    'Không giới hạn',
                    'Multi-branch',
                    'Tích hợp thanh toán',
                    'Hỗ trợ riêng',
                  ].map((row, i) => (
                    <View
                      key={i}
                      style={{
                        paddingVertical: 10,
                        borderBottomWidth: 1,
                        borderColor: '#334155',
                      }}
                    >
                      <Text style={{ color: c.subtext }}>{row}</Text>
                    </View>
                  ))}
                </View>

                {/* Cột Free / Starter / Pro / Enterprise */}
                {[
                  { id: 'free', label: 'Free' },
                  { id: 'starter', label: 'Starter' },
                  { id: 'pro', label: 'Pro' },
                  { id: 'enterprise', label: 'Enterprise' },
                ].map((col) => (
                  <View key={col.id} style={{ width: 140 }}>
                    {[
                      col.id === 'free' ? '1' : col.id === 'starter' ? '3' : col.id === 'pro' ? '10' : 'Không giới hạn',
                      col.id === 'free' ? '5' : col.id === 'starter' ? '30' : col.id === 'pro' ? '100' : 'Không giới hạn',
                      col.id === 'free' ? '—' : 'Có',
                      col.id === 'pro' || col.id === 'enterprise' ? 'Không' : col.id === 'starter' ? 'Có' : 'Có',
                      col.id === 'free' ? '—' : 'Có',
                      col.id === 'free' ? '—' : 'Có',
                      col.id === 'pro' || col.id === 'enterprise' ? 'Có' : '—',
                      col.id === 'pro' || col.id === 'enterprise' ? 'Có' : '—',
                      col.id === 'enterprise' ? 'Có' : '—',
                      col.id === 'enterprise' ? 'Có' : '—',
                      col.id === 'enterprise' ? 'Có' : '—',
                      col.id === 'enterprise' ? 'Có' : '—',
                    ].map((val, i) => (
                      <View
                        key={i}
                        style={{
                          paddingVertical: 10,
                          borderBottomWidth: 1,
                          borderColor: '#334155',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: c.text }}>{val}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={{ height: 12 }} />
            <TouchableOpacity
              onPress={() => setCompareOpen(false)}
              style={{
                alignSelf: 'center',
                backgroundColor: '#22C55E',
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 12,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
