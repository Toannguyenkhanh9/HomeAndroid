import React, { useEffect, useState } from 'react';
import { View, Text, Alert, ScrollView } from 'react-native';
import Card from '../components/Card';
import Button from '../components/Button';
import FormInput from '../components/FormInput';
import { useThemeColors } from '../theme';
import { useTranslation } from 'react-i18next';
import {
  getGlobalLateFeeConfig,
  saveGlobalLateFeeConfig,
  getLeaseLateFeeConfig,
  saveLeaseLateFeeConfig,
  previewLateFeeAmount,
} from '../../services/lateFee';

export default function LateFeeSettings() {
  const c = useThemeColors();
  const { t } = useTranslation();
  const [cfg, setCfg] = useState<LateFeeConfig | null>(null);

  useEffect(() => {
    setCfg(getGlobalLateFeeConfig());
  }, []);

  if (!cfg) return null;

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Button
            title={cfg.enabled ? (t('lateFee.enabled') || 'Enabled') : (t('lateFee.enable') || 'Enable')}
            variant={cfg.enabled ? 'primary' : 'ghost'}
            onPress={() => setCfg({ ...cfg, enabled: !cfg.enabled })}
          />
        </View>

        <Text style={{ color: c.subtext }}>
          {t('lateFee.graceDays') || 'Grace days (after X days)'}
        </Text>
        <FormInput
          keyboardType="numeric"
          value={String(cfg.graceDays || 0)}
          onChangeText={v => setCfg({ ...cfg, graceDays: Math.max(0, Number(v) || 0) })}
        />

        <Text style={{ color: c.subtext }}>
          {t('lateFee.mode') || 'Mode'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            title="Flat"
            variant={cfg.mode === 'flat' ? 'primary' : 'ghost'}
            onPress={() => setCfg({ ...cfg, mode: 'flat' })}
          />
          <Button
            title="%"
            variant={cfg.mode === 'percent' ? 'primary' : 'ghost'}
            onPress={() => setCfg({ ...cfg, mode: 'percent' })}
          />
        </View>

        {cfg.mode === 'flat' ? (
          <>
            <Text style={{ color: c.subtext }}>{t('lateFee.flat') || 'Flat amount'}</Text>
            <FormInput
              keyboardType="decimal-pad"
              value={String(cfg.flat || 0)}
              onChangeText={v => setCfg({ ...cfg, flat: Number((v || '0').replace(/[^\d]/g, '')) || 0 })}
            />
          </>
        ) : (
          <>
            <Text style={{ color: c.subtext }}>{t('lateFee.percent') || 'Percent (%)'}</Text>
            <FormInput
              keyboardType="decimal-pad"
              value={String(cfg.percent || 0)}
              onChangeText={v => setCfg({ ...cfg, percent: Number((v || '0').replace(/[^\d.]/g, '')) || 0 })}
            />
          </>
        )}

        <Text style={{ color: c.subtext }}>{t('lateFee.repeatDaily') || 'Repeat daily after overdue'}</Text>
        <Button
          title={cfg.repeat ? (t('lateFee.enabled') || 'Enabled') : (t('lateFee.enable') || 'Enable')}
          variant={cfg.repeat ? 'primary' : 'ghost'}
          onPress={() => setCfg({ ...cfg, repeat: !cfg.repeat })}
        />

        <Text style={{ color: c.subtext }}>{t('lateFee.cap') || 'Max cap (optional)'}</Text>
        <FormInput
          keyboardType="decimal-pad"
          value={cfg.cap == null ? '' : String(cfg.cap)}
          onChangeText={v =>
            setCfg({
              ...cfg,
              cap: v.trim() === '' ? null : Number((v || '0').replace(/[^\d]/g, '')) || 0,
            })
          }
          placeholder={t('lateFee.capPlaceholder') || 'leave blank = no cap'}
          placeholderTextColor={c.subtext}
        />

        <Button
          title={t('common.save') || 'Save'}
          onPress={() => {
            try {
              saveGlobalLateFeeConfig(cfg);
              Alert.alert(t('common.success') || 'Success');
            } catch (e: any) {
              Alert.alert(t('common.error') || 'Error', e?.message || 'Save failed');
            }
          }}
        />
      </Card>
    </ScrollView>
  );
}
