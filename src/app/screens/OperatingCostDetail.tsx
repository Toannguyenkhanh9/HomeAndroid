// src/app/screens/OperatingCostDetail.tsx
import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, ScrollView, TextInput, Alert} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/RootNavigator';
import Header from '../components/Header';
import Card from '../components/Card';
import Button from '../components/Button';
import {useThemeColors} from '../theme';
import {useCurrency} from '../../utils/currency';
import {onlyDigits, getAppLocale} from '../../utils/number';
import {
  ensureOperatingMonth,
  listOperatingExpenses,
  addOperatingExpense,
  listFixedExpenseTemplates,
  addFixedExpenseTemplate,
  removeFixedExpenseTemplate,
} from '../../services/rent';
import {useTranslation} from 'react-i18next';

type Props = NativeStackScreenProps<RootStackParamList, 'OperatingCostDetail'>;

export default function OperatingCostDetail({route}: Props) {
  const {apartmentId, ym} = route.params as any;
  const c = useThemeColors();
  const {format} = useCurrency();
  const {t} = useTranslation();

  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'fixed' | 'variable'>('variable');

  const [templates, setTemplates] = useState<any[]>([]);
  const [tplName, setTplName] = useState('');
  const [tplAmount, setTplAmount] = useState('');

  const locale = React.useMemo(() => getAppLocale(), []);

  const reload = () => {
    ensureOperatingMonth(apartmentId, ym);
    setItems(listOperatingExpenses(apartmentId, ym));
    setTemplates(listFixedExpenseTemplates(apartmentId));
  };
  useEffect(reload, [apartmentId, ym]);

  const total = useMemo(
    () => items.reduce((s, x) => s + (Number(x.amount) || 0), 0),
    [items],
  );

  const formatTyping = (t: string) => {
    const d = onlyDigits(t);
    if (!d) return '';
    const n = Number(d);
    return n.toLocaleString(locale);
  };

  return (
    <View style={{flex: 1, backgroundColor: 'transparent'}}>
      <Header title={t('operatingCostDetail.title', {ym})} />
      <ScrollView contentContainerStyle={{padding: 12, gap: 12}}>
        <Card>
          <Text style={{color: c.text, fontWeight: '700'}}>{t('operatingCostDetail.monthlyExpenses')}</Text>
          {items.length === 0 ? (
            <Text style={{color: c.subtext}}>— {t('operatingCostDetail.noExpenses')}</Text>
          ) : (
            items.map(it => (
              <View key={it.id} style={{borderRadius: 10, padding: 10, marginTop: 8}}>
                <Text style={{color: c.text, fontWeight: '700'}}>{it.name}</Text>
                <Text style={{color: c.subtext}}>
                  {it.type === 'fixed' ? t('operatingCostDetail.fixed') : t('operatingCostDetail.variable')}
                </Text>
                <Text style={{color: c.text}}>{t('operatingCostDetail.amount')}: {format(it.amount || 0)}</Text>
                {!!it.note && <Text style={{color: c.subtext}}>{t('operatingCostDetail.note')}: {it.note}</Text>}
              </View>
            ))
          )}
          <Text style={{color: c.text, marginTop: 8, fontWeight: '700'}}>
            {t('operatingCostDetail.total')}: {format(total)}
          </Text>
        </Card>

        <Card style={{gap: 8}}>
          <Text style={{color: c.text, fontWeight: '700'}}>{t('operatingCostDetail.addExpense')}</Text>
          <View style={{flexDirection: 'row', gap: 8}}>
            <Button
              title={kind === 'variable' ? t('operatingCostDetail.variable') : t('operatingCostDetail.fixed')}
              variant="ghost"
              onPress={() => setKind(kind === 'variable' ? 'fixed' : 'variable')}
            />
          </View>
          <TextInput
            placeholder={t('operatingCostDetail.expenseName')}
            placeholderTextColor={c.subtext}
            value={name}
            onChangeText={setName}
            style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
          />
          <TextInput
            placeholder={t('operatingCostDetail.expenseAmount')}
            placeholderTextColor={c.subtext}
            keyboardType="numeric"
            value={amount}
            onChangeText={t => setAmount(formatTyping(t))}
            style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
          />
          <Button
            title={t('common.save')}
            onPress={() => {
              const amt = Number(onlyDigits(amount)) || 0;
              if (!name.trim() || amt <= 0) {
                Alert.alert(t('common.missing'), t('operatingCostDetail.missingNameOrAmount'));
                return;
              }
              addOperatingExpense(apartmentId, ym, {name: name.trim(), amount: amt, type: kind});
              setName('');
              setAmount('');
              reload();
            }}
          />
        </Card>

        <Card style={{gap: 8}}>
          <Text style={{color: c.text, fontWeight: '700'}}>{t('operatingCostDetail.fixedTemplates')}</Text>
          {templates.length === 0 ? (
            <Text style={{color: c.subtext}}>— {t('operatingCostDetail.noTemplates')}</Text>
          ) : (
            templates.map(tpl => (
              <View key={tpl.id} style={{borderRadius: 10, padding: 10}}>
                <Text style={{color: c.text, fontWeight: '700'}}>{tpl.name}</Text>
                <Text style={{color: c.text}}>{t('operatingCostDetail.default')}: {format(tpl.amount || 0)}</Text>
                <View style={{alignItems: 'flex-end'}}>
                  <Button
                    title={t('common.delete')}
                    variant="ghost"
                    onPress={() => {
                      removeFixedExpenseTemplate(tpl.id);
                      reload();
                    }}
                  />
                </View>
              </View>
            ))
          )}
          <Text style={{color: c.subtext}}>{t('operatingCostDetail.addTemplate')}</Text>
          <TextInput
            placeholder={t('operatingCostDetail.templateName')}
            placeholderTextColor={c.subtext}
            value={tplName}
            onChangeText={setTplName}
            style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
          />
          <TextInput
            placeholder={t('operatingCostDetail.templateAmount')}
            placeholderTextColor={c.subtext}
            keyboardType="numeric"
            value={tplAmount}
            onChangeText={t => setTplAmount(formatTyping(t))}
            style={{borderRadius: 10, padding: 10, color: c.text, backgroundColor: c.card}}
          />
          <Button
            title={t('operatingCostDetail.addTemplateButton')}
            onPress={() => {
              const v = Number(onlyDigits(tplAmount)) || 0;
              if (!tplName.trim() || v <= 0) {
                Alert.alert(t('common.missing'), t('operatingCostDetail.missingTemplate'));
                return;
              }
              addFixedExpenseTemplate(apartmentId, {name: tplName.trim(), amount: v});
              setTplName('');
              setTplAmount('');
              reload();
            }}
          />
        </Card>
      </ScrollView>
    </View>
  );
}
