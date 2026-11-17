<script lang="ts">
  import LegalDocument from '#lib/components/pholy/LegalDocument.svelte';

  const content = {
    title: 'Kontakt',
    subtitle: 'Fragen zu PHOLY? Wir helfen dir weiter.',
    sections: [
      {
        title: 'Direkter Kontakt',
        paragraphs: ['Weblygo · Inhaber Carsten Luckmann', 'Thomästr. 27 · 59494 Soest · Deutschland'],
        links: [
          {
            label: 'mail@weblygo.de',
            href: 'mailto:mail@weblygo.de?subject=PHOLY%20Anfrage',
          },
          {
            label: '02921 559 72 39',
            href: 'tel:+4929215597239',
          },
        ],
      },
      {
        title: 'Dein Zugang zu PHOLY',
        paragraphs: [
          'PHOLY ist derzeit kostenlos und nur auf persönliche Einladung zugänglich. Öffne zur Registrierung den Link aus deiner Einladung. Ohne gültige Einladung kann kein neues Konto angelegt werden.',
          'Für Hilfe zu deinem Konto nenne uns deine Konto-E-Mail-Adresse und beschreibe dein Anliegen. Sende keine Passwörter oder vollständigen Einladungslinks.',
        ],
      },
      {
        title: 'Datenschutz und Rechte an Bildern',
        paragraphs: [
          'Auch Auskunfts- und Löschanfragen sowie Hinweise auf Rechtsverletzungen erreichst du über die oben genannten Kontaktwege. Nenne bei einem betroffenen Bild oder Album möglichst den Link und beschreibe dein Anliegen. Wir fragen nur die Angaben ab, die zur Bearbeitung und Prüfung deiner Berechtigung erforderlich sind.',
        ],
      },
    ],
  };
</script>

<LegalDocument {...content} dated={false} />
