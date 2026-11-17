<script lang="ts">
  import LegalDocument from '#lib/components/pholy/LegalDocument.svelte';

  const content = {
    title: 'Impressum',
    subtitle: 'Wer hinter PHOLY steht.',
    sections: [
      {
        title: 'Diensteanbieter',
        paragraphs: ['Weblygo', 'Inhaber: Carsten Luckmann', 'Thomästr. 27', '59494 Soest', 'Deutschland'],
      },
      {
        title: 'Kontakt',
        paragraphs: [],
        links: [
          {
            label: 'mail@weblygo.de',
            href: 'mailto:mail@weblygo.de',
          },
          {
            label: '02921 559 72 39',
            href: 'tel:+4929215597239',
          },
        ],
      },
      {
        title: 'Hinweise auf Rechtsverletzungen',
        paragraphs: [
          'Wenn du eine mögliche Verletzung deiner Rechte bemerkst, sende uns den betroffenen Link und eine Beschreibung. Hinweise werden geprüft und erforderliche Maßnahmen ergriffen. Gesetzliche Ansprüche werden dadurch nicht eingeschränkt.',
        ],
      },
      {
        title: 'Software und Bildnachweise',
        paragraphs: [
          'PHOLY basiert auf Immich. Der vollständige Quellcode der eingesetzten angepassten Version, Lizenzhinweise und die Bauanleitung sind öffentlich zugänglich.',
          'Die Beispielbilder auf der Startseite stammen nicht aus privaten Nutzersammlungen. Ihre Herkunfts- und Lizenznachweise sind im Quellcode enthalten.',
        ],
        links: [
          {
            label: 'Quellcode und Lizenzhinweise',
            href: '/source/',
          },
        ],
      },
    ],
  };
</script>

<LegalDocument {...content} dated={false} />
