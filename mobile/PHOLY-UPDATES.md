# PHOLY: App-Updates und Impressum

Diese Erweiterung gehört zur Android-Testreihe mit der Paketkennung
`de.pholy.app.test`, beginnend mit **3.4.1-pholy-mobile.2**. Sie verwendet die
bestehende Flutter-App. Konten, Fotos, Kommentare, Berechtigungen und
Sicherungsaufgaben bleiben bei der bestehenden PHOLY-Plattform.

## Bedienung

**App-Updates** und **Impressum** sind unten auf der Anmeldeseite und in den
Einstellungen erreichbar, auch auf Tablets. Das Impressum enthält die
veröffentlichten Angaben aus `web/src/routes/impressum/+page.svelte` offline.
Die Links zur aktuellen Webfassung, zum Datenschutz, zu Quellen und zum
veröffentlichten Kontakt werden erst nach Antippen geöffnet. Der deutsche
Originalwortlaut bleibt erhalten; die Oberfläche unterstützt Deutsch und
Englisch.

Bei aktivierter automatischer Prüfung sucht PHOLY beim Start beziehungsweise
bei der Rückkehr in den Vordergrund höchstens einmal in 24 Stunden nach einer
neuen Version. Auch erfolglose Verbindungsversuche werden für diese Frist
gespeichert. Der Schalter dafür und eine jederzeit mögliche manuelle Prüfung
liegen auf der Update-Seite. Ein verfügbarer neuer Build erzeugt einen
nicht blockierenden Hinweis. Downloads beginnen ausschließlich nach Auswahl
von **Update herunterladen** und zeigen Fortschritt und Abbruch an.

Nach dem vollständigen Download öffnet **Installation erlauben** bei Bedarf
Androids Freigabe für Installationen durch PHOLY Test. Nach Rückkehr prüft die
App die Berechtigung erneut. **Update installieren** prüft das Paket und
öffnet Androids Installationsdialog. Der Nutzer bestätigt dort die
Aktualisierung. Das Öffnen dieses Dialogs ist ausdrücklich kein Nachweis
einer erfolgreich abgeschlossenen Installation.

Die bereits ausgelieferte Testversion 1 enthält noch keinen Updater. Der
Wechsel von Testversion 1 auf Testversion 2 erfolgt daher einmal durch
manuelles Installieren der neuen APK über die vorhandene App. Danach steht
die Updatefunktion für weitere Veröffentlichungen bereit. Nicht vorher
deinstallieren: Android kann bei identischer Paketkennung und identischem
Signer die vorhandene Installation aktualisieren.

## Öffentliche Updateinformationen

Der fest eingebaute Feed lautet:

`https://raw.githubusercontent.com/cluckmann-web/pholy-source/main/mobile/updates/android-test.json`

Die APKs werden als öffentliche Assets im Quellrepository
`cluckmann-web/pholy-source` veröffentlicht. Für den Download ist kein
GitHub-Token und kein PHOLY-Konto notwendig. Der Plattformzugang bleibt
kostenlos und ausschließlich für eingeladene Nutzer. Die Veröffentlichung
von App-Dateien öffnet keine Registrierung und ändert keine Foto-Freigaben.

Die Updateprüfung verwendet einen getrennten HTTP-Client ohne Immich-
Zugangsdaten, benutzerdefinierte Accountheader oder Plattformcookies.
GitHub erhält die für die Verbindung erforderlichen Netzwerkdaten. Die
Updateprüfung lässt sich in der App ausschalten. Es werden keine
Installations- oder Nutzungsmeldungen an PHOLY versendet.

Das strikte JSON-Schema der Version 1 enthält genau folgende Felder:

```text
schemaVersion: 1
channel: "android-test"
packageName: "de.pholy.app.test"
version: semantische, angezeigte App-Version
notes: {de: Klartext, en: Klartext}
sourceUrl: öffentlicher Quellverweis im pholy-source-Repository
publishedAt: UTC-Zeit im ISO8601-Format mit Z
builds: [{abi, versionCode, minSdk, bytes, sha256, url}, ...]
```

Für Testversion 2 sind die tatsächlichen Android-Versionscodes **3042202**
für `arm64-v8a` und **3044202** für `x86_64`. Flutter ergänzt diese
ABI-spezifischen Werte zur Basisbuildnummer **3040202**. Die App verwendet
die vom Gerät bevorzugte unterstützte Architektur und vergleicht tatsächliche
Android-Versionscodes. Gleiche oder ältere Versionen werden nicht zur
Installation angeboten. Die iOS-Buildnummer bleibt **3040202**.

## Prüfung des Downloads und der Installation

- Der Feed ist auf 64 KiB und jede APK auf 250 MiB begrenzt. Der Parser prüft
  Schema, Kanal, Paket, Version, Zeitangabe, Hash, Größe und eindeutige ABIs.
- APK-URLs beginnen ausschließlich unter dem HTTPS-Releasepfad von
  `cluckmann-web/pholy-source`. Weiterleitungen sind begrenzt und dürfen nur
  auf freigegebene HTTPS-Hosts für GitHub-Releaseassets führen.
- Der Download wird gestreamt, mit exakter Bytezahl und SHA256 geprüft und
  erst danach atomar von einer privaten `.part`-Datei in `.apk` umbenannt.
  Abbruch oder Fehler entfernt die angefangene Datei.
- Die native Bridge akzeptiert nur vollständige APKs direkt aus dem privaten
  Updatecache. Sie erstellt eine separate, schreibgeschützte Installationskopie
  und prüft deren Hash, Paketidentität, höhere tatsächliche Version, aktuelle
  Signierer, Android-Mindestversion und passende native Flutter-Bibliotheken.
- Die aktuelle installierte App bildet die Signatur-Vertrauensbasis. Eine im
  Feed behauptete Signatur wird nicht übernommen. Testschlüsselrotation ist
  für diese Testreihe nicht unterstützt.
- Ein eigener, nicht exportierter FileProvider gibt ausschließlich die
  geprüften Installationskopien frei. Android erhält die temporäre
  Leseberechtigung für genau die angeforderte Datei.
- Die Installationsberechtigung und der Provider werden nur bei expliziten
  Testrelease-Builds mit `PHOLY_ANDROID_TEST_BUILD=true` zusammengeführt.
  Der Hintergrund-Engine für Fotosicherungen erhält keinen Updater.
- Eigene alte Downloads werden begrenzt bereinigt. Fremde Dateien,
  Medienverzeichnisse und Symlinks bleiben unberührt. Während der Vorbereitung
  wird ungefähr die doppelte APK-Größe als freier Cacheplatz benötigt.

## Weitere Version veröffentlichen

1. Versionsname und Basisbuildnummer in den vorhandenen Versions- und
   Builddateien konsistent erhöhen; iOS-Extensionbuilds ebenfalls berücksichtigen.
2. Nach [PHOLY-MOBILE.md](PHOLY-MOBILE.md) isoliert bauen. Dieselbe externe
   Testsignatur beibehalten. Schlüssel und Passwörter bleiben außerhalb von Git.
3. Signatur, Paket, tatsächliche ABI-Versionscodes, SDK, vollständige APKs und
   SHA256-Werte prüfen. Automatisierte Tests und einen echten Android-
   Updateversuch dokumentieren. Quellstand und Buildanleitung veröffentlichen.
4. Die fertig geprüften APKs als öffentliche Releaseassets veröffentlichen und
   deren anonymen Download einschließlich Größe und Hash prüfen.
5. **Erst danach** `mobile/updates/android-test.json` auf `main` auf diese
   fertigen Assets aktualisieren. Exakte tatsächliche Bytezahlen und Hashes
   eintragen; der Quellverweis muss zur APK passen. Bereits veröffentlichte
   APK-Dateien nicht gegen andere Inhalte austauschen.

Der Feed ist eine externe Veröffentlichungsdatei und wird nicht in die APK
kompiliert. Sein abschließender Commit darf deshalb nach dem APK-Quellcommit
liegen. Beide Commit-IDs werden im Auslieferungsnachweis getrennt festgehalten.
Es ist keine Bereitstellung oder Konfigurationsänderung am laufenden
PHOLY-Webserver erforderlich.

## iOS und spätere Store-Ausgaben

Impressum und Updateansicht liegen im gemeinsamen Flutter-Code. Auf iOS oder
einer nicht für Sideload freigeschalteten Android-Ausgabe werden keine
APK-Prüfung, Downloads oder Android-MethodChannel-Aufrufe gestartet.
Store-/TestFlight-Verteilung bleibt eine spätere, eigene Build- und
Signierungsaufgabe. Die weiterhin fehlenden Voraussetzungen stehen in
[PHOLY-MOBILE.md](PHOLY-MOBILE.md); dieser Android-Testrelease behauptet keinen
geprüften iOS-Build.
