import React, {useEffect, useState} from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import {useThemeColors} from '../theme';
import {listChargeTypes} from '../../services/rent';
import {onlyDigits, groupVN} from '../../utils/number';

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (
    picked: Array<{
      charge_type_id: string;
      is_variable: boolean;
      unit_price: number;
    }>
  ) => void;
};

export default function ChargeChooserModal({visible, onClose, onConfirm}: Props) {
  const c = useThemeColors();
  const [rows, setRows] = useState<any[]>([]);
  const [picked, setPicked] = useState<Record<string, any>>({});
  const [displayPrice, setDisplayPrice] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!visible) return;
    const list = listChargeTypes() as any[];

    // lọc bỏ "Bảo trì"/"Baobao tri"
    const filtered = list.filter(
      x => !/^(baobao tri|bảo trì)$/i.test((x.name || '').trim())
    );

    // "Tiền phòng" lên đầu
    filtered.sort((a, b) => {
      if (a.name === 'Tiền phòng') return -1;
      if (b.name === 'Tiền phòng') return 1;
      return a.name.localeCompare(b.name);
    });

    setRows(filtered);

    // seed giá hiển thị cho phí cố định
    const init: Record<string, string> = {};
    for (const r of filtered) {
      const id = r.charge_type_id || r.id;
      const isVar =
        Number(r.is_variable) === 1 ||
        (r.meta_json && JSON.parse(r.meta_json).is_variable);
      if (!isVar) init[id] = groupVN(String(r.unit_price ?? 0));
    }
    setDisplayPrice(init);
  }, [visible]);

  const toggle = (id: string, isVar: boolean, unit_price?: number) => {
    setPicked(prev => {
      const exists = !!prev[id];
      if (exists) {
        const clone = {...prev};
        delete clone[id];
        return clone;
      }
      return {
        ...prev,
        [id]: {
          charge_type_id: id,
          is_variable: isVar,
          unit_price: unit_price ?? 0,
        },
      };
    });
  };

  const updatePrice = (id: string, value: string) => {
    setDisplayPrice(prev => ({...prev, [id]: value}));
    setPicked(prev => {
      const cur =
        prev[id] || {charge_type_id: id, is_variable: false, unit_price: 0};
      return {
        ...prev,
        [id]: {...cur, unit_price: Number(onlyDigits(value)) || 0},
      };
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{flex: 1, backgroundColor: '#0009', justifyContent: 'flex-end'}}>
        <View
          style={{
            backgroundColor: c.bg,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            padding: 16,
            maxHeight: '80%',
          }}>
          <Text style={{fontWeight: '700', fontSize: 16, color: c.text}}>
            Chọn các khoản phí
          </Text>

          <ScrollView style={{marginVertical: 12}}>
            {rows.map(r => {
              const id = r.charge_type_id || r.id;
              const isVar =
                Number(r.is_variable) === 1 ||
                (r.meta_json && JSON.parse(r.meta_json).is_variable);
              const checked = !!picked[id];

              return (
                <View
                  key={id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginVertical: 6,
                    padding: 8,
                    borderRadius: 10,
                    // nền xanh nhạt khi chọn (accent với alpha 0x22)
                    backgroundColor: checked ? `${c.accent}22` : 'transparent',
                  }}>
                  {/* Checkbox */}
                  <TouchableOpacity
                    onPress={() => toggle(id, isVar, r.unit_price)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      borderWidth: 2,
                      borderColor: checked ? c.accent : c.border,
                      backgroundColor: checked ? c.accent : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 10,
                    }}>
                    {checked ? (
                      <Text style={{color: c.accentText ?? '#fff', fontWeight: '800', lineHeight: 16}}>
                        ✓
                      </Text>
                    ) : null}
                  </TouchableOpacity>

                  {/* Tên phí */}
                  <Text style={{flex: 1, color: checked ? c.text : c.text}}>
                    {r.name} {isVar ? '(KHÔNG cố định)' : '(cố định)'}
                  </Text>

                  {/* Ô nhập giá cho phí cố định khi đã tick */}
                  {!isVar && checked && (
                    <TextInput
                      keyboardType="numeric"
                      value={displayPrice[id] ?? ''}
                      onChangeText={t => updatePrice(id, t)}
                      onBlur={() =>
                        setDisplayPrice(prev => ({
                          ...prev,
                          [id]: groupVN(prev[id] ?? ''),
                        }))
                      }
                      style={{
                        width: 120,
                        borderWidth: 1,
                        borderColor: '#2A2F3A',
                        backgroundColor: c.card,
                        color: c.text,
                        padding: 8,
                        borderRadius: 10,
                      }}
                    />
                  )}
                </View>
              );
            })}
          </ScrollView>

          <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 12}}>
            <TouchableOpacity
              onPress={onClose}
              style={{
                backgroundColor: c.card,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 10,
              }}>
              <Text style={{color: c.text}}>Đóng</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                onConfirm(Object.values(picked));
                onClose();
              }}
              style={{
                backgroundColor: c.accent,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 10,
              }}>
              <Text style={{color: c.accentText ?? '#fff'}}>Xác nhận</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
