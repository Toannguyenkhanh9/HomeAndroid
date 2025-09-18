// src/app/screens/HelpScreen.tsx
import React from 'react';
import { View, Text, ScrollView, Image } from 'react-native';
import Header from '../components/Header';
import Card from '../components/Card';
import { useThemeColors } from '../theme';
import { useTranslation } from 'react-i18next';
const IMAGES = {
  welcome:   require('../assets/onboarding/welcome.png'),
  apartment: require('../assets/onboarding/apartment.png'),
  contract:  require('../assets/onboarding/contract.png'),
  settle:    require('../assets/onboarding/settle.png'),
  opex:      require('../assets/onboarding/opex.png'),
  report:    require('../assets/onboarding/report.png'),
} as const;

export default function HelpScreen() {
  const c = useThemeColors();
  const { t } = useTranslation();

  const Section = ({
    title,
    desc,
    note,
    img,
    imgAlt,
  }: {
    title: string;
    desc?: string;
    note?: string;
    img?: any;
    imgAlt?: string;
  }) => (
    <Card style={{ gap: 8 }}>
      <Text style={{ color: c.text, fontWeight: '800' }}>{title}</Text>
      {!!desc && <Text style={{ color: c.subtext }}>{desc}</Text>}

      {/* Placeholder ảnh minh hoạ — bạn gắn screenshot vào đây */}
{img ? (
      <Image
        source={img}
        style={{
          width: '100%',
          height: 200,
          resizeMode: 'contain',
          borderRadius: 10,
          backgroundColor: c.card,
        }}
      />
    ) : (
      <View
        style={{
          height: 180,
          backgroundColor: c.card,
          borderRadius: 10,
          justifyContent: 'center',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: c.border,
        }}
      >
        <Text style={{ color: c.subtext }}>
          {imgAlt || t('help.placeholder.image')}
        </Text>
      </View>
    )}

      {!!note && (
        <Text style={{ color: c.subtext, fontStyle: 'italic' }}>{note}</Text>
      )}
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Section
          title={`1. ${t('help.main.title')}`}
          desc={t('help.main.desc')}
          img={IMAGES.contract}
        />

        <Section
          title={`2. ${t('help.apartments.title')}`}
          desc={t('help.apartments.desc')}
          note={t('help.apartments.note')}
        />

        <Section
          title={`3. ${t('help.rooms.title')}`}
          desc={t('help.rooms.desc')}
          note={t('help.rooms.note')}
           img={IMAGES.contract}
        />

        <Section
          title={`4. ${t('help.tenants.title')}`}
          desc={t('help.tenants.desc')}
           img={IMAGES.contract}
        />

        <Section
          title={`5. ${t('help.leases.title')}`}
          desc={t('help.leases.desc')}
          note={t('help.leases.note')}
           img={IMAGES.contract}
        />

        <Section
          title={`6. ${t('help.cycles.title')}`}
          desc={t('help.cycles.desc')}
          note={t('help.cycles.note')}
           img={IMAGES.contract}
        />

        <Section
          title={`7. ${t('help.invoices.title')}`}
          desc={t('help.invoices.desc')}
          note={t('help.invoices.note')}
           img={IMAGES.contract}
        />

        <Section
          title={`8. ${t('help.charges.title')}`}
          desc={t('help.charges.desc')}
          note={t('help.charges.note')}
           img={IMAGES.contract}
        />

        <Section
          title={`9. ${t('help.operatingCosts.title')}`}
          desc={t('help.operatingCosts.desc')}
          note={t('help.operatingCosts.note')}
           img={IMAGES.contract}
        />

        <Section
          title={`10. ${t('help.reports.title')}`}
          desc={t('help.reports.desc')}
          note={t('help.reports.note')}
           img={IMAGES.contract}
        />

        <Section
          title={`11. ${t('help.settings.title')}`}
          desc={t('help.settings.desc')}
          note={t('help.settings.note')}
           img={IMAGES.contract}
        />

        <Card style={{ gap: 8 }}>
          <Text style={{ color: c.text, fontWeight: '800' }}>
            {t('help.tips.title')}
          </Text>
          <Text style={{ color: c.subtext }}>• {t('help.tips.backup')}</Text>
          <Text style={{ color: c.subtext }}>• {t('help.tips.search')}</Text>
          <Text style={{ color: c.subtext }}>• {t('help.tips.format')}</Text>
          <Text style={{ color: c.subtext }}>• {t('help.tips.contact')}</Text>
        </Card>
      </ScrollView>
    </View>
  );
}
