<script lang="ts">
  import LegalDocument from '#lib/components/pholy/LegalDocument.svelte';

  const content = {
    title: 'Nutzungsbedingungen',
    subtitle: 'Kostenlos. Auf Einladung. Mit klaren Regeln für deine Sammlung.',
    sections: [
      {
        title: '1. Anbieter und Vereinbarung',
        paragraphs: [
          'Diese Bedingungen gelten für die Nutzung von PHOLY bei Weblygo, Inhaber Carsten Luckmann, Thomästr. 27, 59494 Soest, Deutschland, E-Mail: mail@weblygo.de. Individuelle Vereinbarungen gehen vor.',
          'Die Einladung ermöglicht dir, ein Konto für die darin bestimmte E-Mail-Adresse anzulegen. Mit deiner Zustimmung zu diesen Bedingungen und der erfolgreichen Registrierung kommt die Nutzungsvereinbarung zustande. Die Vertragssprache ist Deutsch. Du kannst diese Seite über deinen Browser speichern oder drucken.',
        ],
      },
      {
        title: '2. Kostenloser Zugang auf Einladung',
        paragraphs: [
          'PHOLY ist derzeit kostenlos. Für die Registrierung sind keine Zahlungsdaten erforderlich. Es gibt keine automatische Umstellung auf einen kostenpflichtigen Tarif. Kostenpflichtige Leistungen würden eine gesonderte ausdrückliche Vereinbarung voraussetzen.',
          'Ein Einladungslink ist sieben Tage gültig, einmal verwendbar und kann vor seiner Verwendung widerrufen werden. Ein Anspruch auf eine Einladung besteht nicht. Die Einladung ist persönlich und darf nicht weitergegeben werden.',
        ],
      },
      {
        title: '3. Leistungsumfang',
        paragraphs: [
          'PHOLY ermöglicht das Speichern, Organisieren, Anzeigen und Teilen von Fotos und Videos mit den jeweils angebotenen Funktionen. Ein für dein Konto geltendes Speicherlimit wird bei der Registrierung und im angemeldeten Bereich angezeigt. Unbegrenzter Speicher wird nicht zugesagt.',
          'Neben der Webseite kannst du die Immich-App verwenden. Trage dort https://pholy.de als Serveradresse ein und melde dich mit deinen PHOLY-Zugangsdaten an. Für die App gelten ergänzend die Bedingungen ihres Anbieters und des jeweiligen App-Stores.',
        ],
      },
      {
        title: '4. Konto und zulässige Nutzung',
        paragraphs: [
          'Halte deine Kontoangaben aktuell und schütze deine Zugangsdaten. Informiere uns, wenn du einen unbefugten Zugriff vermutest.',
          'Lade nur Inhalte hoch und teile nur Inhalte, für die du die erforderlichen Rechte und datenschutzrechtlichen Voraussetzungen hast. Beachte insbesondere Urheberrechte und Persönlichkeitsrechte abgebildeter Personen. Rechtswidrige Inhalte, Schadsoftware, die Umgehung von Zugangssperren und gezielte Störungen des Dienstes sind unzulässig.',
        ],
      },
      {
        title: '5. Rechte an deinen Inhalten',
        paragraphs: [
          'Du behältst deine Rechte an hochgeladenen Inhalten. Du räumst uns ausschließlich die nicht ausschließlichen Rechte ein, die zur vereinbarten Speicherung, technischen Verarbeitung, Darstellung und von dir veranlassten Freigabe erforderlich sind.',
          'Damit ist keine Erlaubnis verbunden, deine Fotos für Werbung, Verkauf oder allgemeines KI-Training zu verwenden. Weitergehende Nutzungen benötigen eine gesonderte Grundlage.',
        ],
      },
      {
        title: '6. Freigaben und eigene Kopien',
        paragraphs: [
          'Prüfe Empfänger, Standortdaten und Freigabeeinstellungen vor dem Teilen. Wer einen Freigabelink erhält, kann im Rahmen seiner Berechtigungen zugreifen. Bereits heruntergeladene Kopien werden durch das Widerrufen einer Freigabe nicht gelöscht.',
          'Bewahre wichtige Originale zusätzlich selbst auf. Eine automatische Datensicherung und eine Wiederherstellung gelöschter Inhalte werden derzeit nicht zugesagt. Gesetzliche Rechte und vereinbarte Pflichten bleiben unberührt.',
        ],
      },
      {
        title: '7. Betrieb und Änderungen',
        paragraphs: [
          'Wartung, Sicherheitsmaßnahmen oder Störungen können die Verfügbarkeit zeitweise beeinträchtigen. Wir dürfen bei nachvollziehbaren Verstößen erforderliche und verhältnismäßige Schutzmaßnahmen treffen. Soweit möglich und rechtlich zulässig, informieren wir dich über Gründe und Abhilfemöglichkeiten.',
          'Wesentliche Änderungen dieser Vereinbarung benötigen eine wirksame Grundlage. Dein Schweigen oder eine erneute Anmeldung gelten nicht pauschal als Zustimmung zu geänderten Bedingungen.',
        ],
      },
      {
        title: '8. Beendigung und Datenmitnahme',
        paragraphs: [
          'Die kostenlose Vereinbarung läuft auf unbestimmte Zeit. Du kannst sie jederzeit über unseren Kontakt beenden und die Kontolöschung verlangen. Wir können sie mit einer Frist von 30 Tagen kündigen. Das Recht beider Seiten zur außerordentlichen Kündigung aus wichtigem Grund bleibt bestehen.',
          'Vor dem Ende kannst du deine Inhalte über die Downloadfunktionen sichern. Bei einer ordentlichen Beendigung durch uns erhältst du während der Kündigungsfrist Gelegenheit zur Datenmitnahme. Löschabläufe und technische Wartefristen sind in den Datenschutzhinweisen beschrieben.',
        ],
      },
      {
        title: '9. Haftung und Kontakt',
        paragraphs: [
          'Es gelten die gesetzlichen Haftungsregeln. Insbesondere wird keine Haftung für Vorsatz, grobe Fahrlässigkeit oder Schäden an Leben, Körper und Gesundheit ausgeschlossen. Zwingende Verbraucherrechte bleiben unberührt.',
          'Fragen oder Beschwerden kannst du an mail@weblygo.de richten.',
        ],
      },
    ],
  };
</script>

<LegalDocument {...content} dated={true} />
