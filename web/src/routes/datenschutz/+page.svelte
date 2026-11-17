<script lang="ts">
  import LegalDocument from '#lib/components/pholy/LegalDocument.svelte';

  const content = {
    title: 'Datenschutzhinweise',
    subtitle: 'Welche Daten PHOLY für deine Sammlung verarbeitet.',
    sections: [
      {
        title: '1. Verantwortlicher',
        paragraphs: [
          'Weblygo, Inhaber Carsten Luckmann, Thomästr. 27, 59494 Soest, Deutschland. Für Datenschutzanfragen erreichst du uns unter mail@weblygo.de oder 02921 559 72 39.',
        ],
      },
      {
        title: '2. Website und Sicherheit',
        paragraphs: [
          'Beim Aufruf werden technische Verbindungsdaten verarbeitet, insbesondere IP-Adresse, Zeitpunkt, angeforderte Adresse, Browserkennung, HTTP-Status und gegebenenfalls Referrer. Sie ermöglichen die Auslieferung, Fehleranalyse und Absicherung des Dienstes. Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 Buchst. f DSGVO; unser Interesse ist der sichere und verfügbare Betrieb.',
          'Webprotokolle werden derzeit größenabhängig rotiert: ab 10 MiB mit bis zu zehn rotierten Dateien je Protokollart. Daraus ergibt sich keine feste Aufbewahrungsdauer in Tagen. Für die Abwehr konkreter Sicherheitsvorfälle erforderliche Auszüge können bis zur Klärung des Vorfalls aufbewahrt werden.',
        ],
      },
      {
        title: '3. Einladung, Konto und Anmeldung',
        paragraphs: [
          'Für eine persönliche Einladung hinterlegt der Administrator deine E-Mail-Adresse und gegebenenfalls ein Speicherlimit. Gespeichert werden außerdem Aussteller, Ablauf, Widerruf und Verwendung der Einladung. Der zufällige Zugangsschlüssel wird nur als Hash gespeichert. Er läuft nach sieben Tagen ab und ist einmal verwendbar. Zur Missbrauchsabwehr werden kurzzeitig Zähler zu gehashten IP-Adressen im Arbeitsspeicher geführt.',
          'Bei der Registrierung verarbeiten wir deinen Namen, deine E-Mail-Adresse, das gehashte Passwort und die angenommene Version der Nutzungsbedingungen. Hinzu kommen Konto- und Sitzungseinstellungen sowie gegebenenfalls ein Profilbild. Dies dient der von dir gewünschten kostenlosen Nutzung nach Art. 6 Abs. 1 Buchst. b DSGVO; Missbrauchsschutz dient zusätzlich unserem berechtigten Interesse nach Buchst. f. Einladungsdaten vor der Registrierung dienen der Zugangskontrolle im geschlossenen Nutzerkreis auf Grundlage dieses berechtigten Interesses.',
          'Ohne die Pflichtangaben kann kein Konto angelegt werden. Bei Passkeys verarbeitet PHOLY öffentliche Authentifizierungsinformationen. Ein Fingerabdruck zur lokalen Gerätefreigabe wird nicht an PHOLY übermittelt.',
          'Auf Wunsch kann die Administration eine Einladung per E-Mail senden. Dazu werden Versandversuch und Annahme durch den Mailserver vermerkt; die Annahme ist keine Bestätigung der Zustellung im Posteingang. Für die Passwort-Wiederherstellung wird ein einmal verwendbarer, 30 Minuten gültiger Link per E-Mail versendet. PHOLY speichert den Schlüssel nur als Hash. Nach dem Zurücksetzen werden bestehende Sitzungen abgemeldet.',
        ],
      },
      {
        title: '4. Fotos, Videos und Bildverarbeitung',
        paragraphs: [
          'PHOLY speichert hochgeladene Dateien und Metadaten wie Dateinamen, Aufnahmezeit, Kameradaten, Albumzuordnung, Kommentare und enthaltene Standortdaten. Für Darstellung und Suche werden Vorschauen, Videoableitungen und Suchindizes erstellt. Die Bereitstellung dieser Funktionen für dein Konto dient der Nutzungsvereinbarung nach Art. 6 Abs. 1 Buchst. b DSGVO. Rechte abgebildeter oder erwähnter Dritter sind davon unabhängig zu beachten.',
          'Die installierte Bildanalyse unterstützt Motivsuche, ähnliche Bilder und Gesichtsgruppierung. Die automatische Gesichtsgruppierung ist derzeit aktiviert: Sie erkennt Gesichter und verarbeitet technische Merkmale, um Bilder derselben Person zusammenzufassen. Die Analyse läuft im privaten PHOLY-Bildanalysedienst; Bilder werden dafür nicht an einen externen KI-Analysedienst gesendet.',
          'Eine AGB-Zustimmung ersetzt keine ausdrückliche Einwilligung abgebildeter Dritter. Bei biometrischen Daten oder anderen besonderen Datenkategorien sind zusätzlich die Voraussetzungen des Art. 9 DSGVO zu beachten. Wende dich bei Fragen zu betroffenen Personen oder gewünschten Löschungen an den oben genannten Kontakt. Die Bildfunktionen treffen keine Entscheidungen mit rechtlicher oder vergleichbar erheblicher Wirkung über Personen.',
          'Der persönliche Uploadverlauf speichert Dateiname, Dateigröße, Zeitpunkt sowie Upload- und Verarbeitungsstatus für 90 Tage. Er dient der Übersicht und Fehlerbehebung. Speicherwarnungen und Verarbeitungshinweise können im Konto angezeigt werden. Unvollständige fortsetzbare Uploads werden nach sieben Tagen verworfen; Angaben zur Wiederaufnahme bleiben kontobezogen im Browser, ohne dort Originaldateien oder Zugangsdaten zu speichern.',
        ],
      },
      {
        title: '5. Teilen und Empfänger',
        paragraphs: [
          'Album-, Partner- und Linkfreigaben ermöglichen den von dir bestimmten Empfängern Zugriff entsprechend den gewählten Einstellungen. Je nach Freigabe können auch Downloads oder Uploads möglich sein. Prüfe insbesondere enthaltene Standortdaten und sensible Inhalte. Bereits heruntergeladene Kopien lassen sich durch die spätere Deaktivierung eines Links nicht zurückrufen.',
          'Die Medien liegen auf eingebundenem Hetzner-Speicher. Anwendungsdatenbank und Bildanalyse werden in getrennten PHOLY-Diensten auf der Serverinfrastruktur verarbeitet. Technische Hostingdienstleister können Daten im für den Betrieb erforderlichen Umfang verarbeiten. Weitere Empfänger sind von dir berechtigte Freigabeempfänger und gegebenenfalls Behörden aufgrund gesetzlicher Verpflichtungen.',
          'Die Community-Funktion ist freiwillig und zunächst nicht veröffentlicht. Erst nach deiner Freigabe werden der gewählte Profilname, die Beschreibung und ausdrücklich ausgewählte eigene Fotos öffentlich erreichbar. Dafür werden verkleinerte Bildversionen ohne eingebettete EXIF- und Standortmetadaten ausgeliefert. Der sichtbare Bildinhalt kann trotzdem personenbezogene Informationen enthalten. Du kannst die Veröffentlichung wieder beenden; zuvor angefertigte Kopien Dritter lassen sich dadurch nicht zurückrufen.',
          'Beim Folgen eines Profils speichert PHOLY die Zuordnung zwischen den Konten. Eine Inhaltsmeldung enthält meldendes Konto, betroffenes Profil oder Foto, Grund, Beschreibung und Bearbeitungsstatus. Diese Angaben werden der Administration zur Prüfung angezeigt. Moderationsmaßnahmen betreffen die öffentliche Darstellung und löschen keine privaten Originale.',
        ],
      },
      {
        title: '6. Standortdaten, Karten und App-Stores',
        paragraphs: [
          'Standortdaten können aus den Metadaten deiner Dateien stammen. Ortsnamen werden mit lokal bereitgestellten Geodaten zugeordnet. Die Kartendarstellung verwendet dagegen externe Ressourcen von tiles.immich.cloud. Beim Abruf werden insbesondere deine IP-Adresse, technische Verbindungsdaten und der angeforderte Kartenausschnitt an den Kartenserver übertragen.',
          'Links zu Apple App Store und Google Play öffnen externe Angebote. Erst beim Öffnen des Links kommunizierst du mit diesen Anbietern. Für ihre Verarbeitung gelten deren Datenschutzhinweise. Die Immich-App verbindet sich nach Einrichtung der Serveradresse https://pholy.de mit PHOLY.',
        ],
      },
      {
        title: '7. Cookies und Browser-Speicher',
        paragraphs: [
          'Für Anmeldung, Sicherheit und gewählte Einstellungen verwendet PHOLY Cookies und lokalen Browser-Speicher, unter anderem für Sprache, Darstellungsoptionen und Ansichten. Soweit diese Zugriffe für den ausdrücklich gewünschten Dienst erforderlich sind, beruhen sie auf § 25 Abs. 2 TDDDG. Schrift und Beispielbilder der öffentlichen Seiten werden lokal ausgeliefert.',
        ],
      },
      {
        title: '8. Kontaktanfragen',
        paragraphs: [
          'Bei einer Kontaktaufnahme verarbeiten wir deine Kontaktangaben, deine Nachricht und die zur Bearbeitung erforderlichen Informationen. Konto- und Vertragsanfragen beruhen auf Art. 6 Abs. 1 Buchst. b DSGVO, sonstige Anfragen auf unserem berechtigten Interesse an der Bearbeitung nach Buchst. f. Daten werden gelöscht, wenn das Anliegen abgeschlossen ist und weder gesetzliche Pflichten noch notwendige Rechtsverteidigung eine weitere Aufbewahrung erfordern.',
          'Supportanfragen im Hilfebereich enthalten Kategorie, Betreff, Nachrichtenverlauf und Bearbeitungsstatus. Sie sind für dein Konto und die Administration sichtbar. Erledigte Anfragen werden 90 Tage nach der letzten Aktualisierung entfernt; bei endgültiger Kontolöschung werden die zugehörigen Anfragen ebenfalls entfernt. Sende keine Passwörter oder vollständigen Zugangslinks.',
        ],
      },
      {
        title: '9. Speicherung und Löschung',
        paragraphs: [
          'Kontodaten und Inhalte werden für die Dauer der vereinbarten Nutzung verarbeitet. Der Papierkorb bewahrt gelöschte Medien derzeit bis zu 30 Tage auf. Eine ausdrücklich veranlasste endgültige Löschung kann früher erfolgen. Die technische Entfernung wird durch Verarbeitungsaufgaben ausgeführt.',
          'Unter „Meine Daten & Konto“ kannst du nach Bestätigung deines Passworts Kontodaten und Metadaten als JSON sowie eigene Originaldateien als ZIP-Teile herunterladen. Die Exportfreigabe gilt eine Stunde für die bestätigte Browsersitzung. Originale fremder Konten werden nicht exportiert.',
          'Eine Kontoschließung kannst du im selben Bereich vormerken und sieben Tage lang widerrufen. Danach wird das Konto gesperrt und die Löschung über die bestehende Serverwarteschlange eingeleitet; deren zusätzliche Wartefrist beträgt derzeit sieben Tage. Zugeordnete Einladungsnachweise, Uploadverlauf und Supportanfragen werden mit der endgültigen Kontolöschung entfernt. Du kannst eine Löschung auch beim Betreiber anfragen. Einzelne Daten können für gesetzliche Pflichten oder erforderliche Rechtsverteidigung länger benötigt werden.',
        ],
      },
      {
        title: '10. Deine Rechte',
        paragraphs: [
          'Nach Maßgabe der DSGVO hast du Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit. Gegen Verarbeitungen auf Grundlage berechtigter Interessen kannst du aus Gründen deiner besonderen Situation widersprechen. Eine tatsächlich erteilte Einwilligung kannst du mit Wirkung für die Zukunft widerrufen.',
          'Du kannst dich bei einer Datenschutzaufsichtsbehörde beschweren, insbesondere an deinem gewöhnlichen Aufenthaltsort, deinem Arbeitsplatz oder am Ort eines vermuteten Verstoßes. Für Nordrhein-Westfalen erreichst du die LDI NRW, Kavalleriestraße 2–4, 40213 Düsseldorf, unter poststelle@ldi.nrw.de.',
        ],
        links: [
          {
            label: 'Beschwerde bei der LDI NRW',
            href: 'https://www.ldi.nrw.de/kontakt/ihre-beschwerde',
          },
        ],
      },
    ],
  };
</script>

<LegalDocument {...content} dated={true} />
