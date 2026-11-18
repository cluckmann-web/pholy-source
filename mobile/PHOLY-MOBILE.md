# PHOLY Mobile: Entwicklung, Build und Testinstallation

Diese Anleitung gehört zur Flutter-App **3.4.1-pholy-mobile.2**, Basisbuildnummer
**3040202**. Sie beschreibt den Quellstand und seine Buildwege. Ausgeführte
Prüfungen, APK-Prüfsummen, Downloadadressen und verbleibende Laufzeitbefunde
gehören in den jeweiligen separaten Prüf- und Auslieferungsbericht; diese
Anleitung bestätigt keine bestandenen Geräteprüfungen.

## 1. Grundlage und Umfang

PHOLY entwickelt die vorhandene Immich-App in `mobile/` weiter. Anmeldung,
Benutzerkonten, Berechtigungen, Fotos, Alben, Uploads, Synchronisierung und
automatische Sicherung nutzen die bestehende Plattform. Der lokale
Drift-/SQLite-Speicher bleibt Bestandteil des mobilen Clients; es gibt keine
zusätzliche Plattform oder separate serverseitige Fotodatenbank.

Die zugehörige Plattformbasis ist **3.4.1-pholy.16**, Commit
`3902eeb36c0a61ff0cccc307091b07d776b0193a`. Die Angaben zur mobilen Version,
zu den Kennungen und zum entsprechenden Quellstand stehen in
[PHOLY-MOBILE-RELEASE.json](PHOLY-MOBILE-RELEASE.json). Das öffentliche
Quellrepository ist [cluckmann-web/pholy-source](https://github.com/cluckmann-web/pholy-source).
Der im Manifest eingetragene mobile Quellverweis lautet
`releases/pholy-mobile-3.4.1-test.2`; bei der Auslieferung muss dieser Verweis
zum tatsächlich veröffentlichten Quellstand der APK passen.

Die normale Anmeldung ist fest auf **https://pholy.de** ausgerichtet. Es gibt
keine Servereingabe und keine offene Registrierung. Die Einführung erklärt
den kostenlosen Zugang auf Einladung. Die Passwort-Wiederherstellung nutzt
`/api/pholy/auth/status` und `/api/pholy/auth/forgot-password`; ihre
Verfügbarkeit richtet sich nach Passwortanmeldung und Mailkonfiguration
der Plattform. Der Link aus der Wiederherstellungs-E-Mail führt durch den
bestehenden PHOLY-Webablauf. Die App speichert keine Reset-Tokens.

Die Oberfläche verwendet die PHOLY-Marke, helle und dunkle Farben sowie
überwiegend eckige Material-Bedienelemente. Runde Avatare bleiben erhalten.
Gemeinsamer Flutter-Code und native iOS-Projektkonfiguration sind vorhanden.
**Für diesen Entwicklungsstand ist kein iOS-Build und keine iOS-Signierung
nachgewiesen.** Die Voraussetzungen dafür stehen in Abschnitt 8.

## 2. Repository und isolierte Arbeitsumgebung

Es wird das vollständige Monorepository benötigt: Neben `mobile/` verwenden
die Builds insbesondere `open-api/`, `i18n/`, `native/` und die bestehenden
Assets unter `web/static/pholy/`. Die Anleitung setzt ein separates lokales
Checkout beziehungsweise einen isolierten Build-Arbeitsplatz voraus. Die
Skripte bauen oder deployen die laufende Webseite nicht und benötigen keinen
Zugriff auf deren Produktionsdatenbank.

Vor Änderungen [AGENTS.md](../AGENTS.md) und eventuell geltende weitere
Anweisungen lesen. Vor einem Commit den Diff prüfen. Keine Benutzerfotos,
Produktionszugänge, Schlüsseldateien oder lokale Build-Caches einchecken.
Buildvorbereitung und Tests benötigen keine zusätzlichen Backups.

### Festgelegte Toolchain

| Bestandteil | Version beziehungsweise Vorgabe | Quelle |
| --- | --- | --- |
| Flutter | **3.47.2** | `pubspec.yaml`, `mise.toml`; das Vorbereitungsskript prüft die Version |
| Dart | **3.13.2**, mit Flutter 3.47.2 ausgeliefert | Flutter-SDK; `native_core` benötigt Dart ab 3.13 |
| Java/JDK | **21.0.2**; Android-Quell-/Bytecodeziel 17 | `mise.toml`, `android/app/build.gradle` |
| Gradle | **8.14**, über den Repository-Wrapper | `android/gradle/wrapper/gradle-wrapper.properties` |
| Android Gradle Plugin | **8.11.2** | `android/settings.gradle`, Versionskatalog |
| Kotlin / KSP | **2.2.20 / 2.2.20-2.0.3** | Android-Versionskatalog |
| Kotlin-Serialization-Plugin | **2.1.0**, bestehende Kompatibilitätsvorgabe | Android-Versionskatalog |
| Android SDK | Compile-/Target-SDK **36**, Minimum **26** | Flutter 3.47.2 und `android/app/build.gradle` |
| Zusätzliche Android-SDK-Pakete | Plattformen **33, 34, 35 und 36**; Build-Tools **35.0.0 und 36.0.0** | Die vorhandenen nativen Flutter-Plugins verwenden unterschiedliche Compile-SDKs; AGP benötigt außerdem Build-Tools 35.0.0 |
| Android NDK | **28.2.13676358** | `flutter.ndkVersion` aus Flutter 3.47.2 |
| Rust | **1.99.1** über rustup | `../native/crates/native_core_ffi/rust-toolchain.toml` |
| Node.js | **24.22.1** | `../mise.toml`; unter anderem für den Build-Runner-Patch |
| OpenAPI-Generator-CLI / Generator | **2.42.0 / 7.26.0** | `../mise.toml`, `../open-api/openapitools.json` |
| Python | **3.11 oder neuer** | Die PHOLY-Skripte lesen TOML mit `tomllib` |
| CocoaPods, nur macOS/iOS | **1.16.2** laut Lockdatei | `ios/Podfile.lock` |

Zusätzlich werden Git, Bash, `patch`, `realpath`, die Android-SDK-Werkzeuge
einschließlich Plattform-/Build-Tools und ein C/C++-Compiler mit libclang für
die nativen FFI-Bindings benötigt. Die Android-SDK-Lizenzen müssen auf dem
Buildrechner akzeptiert sein. `flutter`, `dart`, `java`, `node`,
`openapi-generator-cli`, `python3`, `cargo` und `rustup` müssen im `PATH`
auffindbar sein. SDK-Pfade werden über die übliche lokale Flutter-/Android-
Konfiguration eingerichtet; rechnerabhängige Pfade gehören nicht ins Git.
`JAVA_HOME` muss auf ein vollständiges JDK mit `bin/javac` zeigen; eine
vorhandene Java-Laufzeit allein reicht für den Android-Build nicht aus.

Die benötigten Android-Pakete lassen sich mit dem Android-SDK-Manager installieren:

```bash
sdkmanager 'platforms;android-33' 'platforms;android-34' \
  'platforms;android-35' 'platforms;android-36' \
  'build-tools;35.0.0' 'build-tools;36.0.0' \
  'platform-tools' 'ndk;28.2.13676358'
```

Der native Rust-Code wird während des Flutter-Builds aus Quellcode kompiliert.
Für Android werden hier `aarch64-linux-android` und `x86_64-linux-android`
benötigt. Der native Build-Hook installiert das jeweils benötigte rustup-Ziel.
Die beiden PHOLY-Skripte setzen `RUSTUP_TOOLCHAIN` ausdrücklich aus der
Toolchain-Datei des Crates. Dieser Pin ist für diese Buildwege maßgeblich,
auch wenn eine lokale mise-Umgebung eine andere Rust-Version voreinstellt.

Die Lockdateien für Dart, Cargo und CocoaPods sowie die vorhandenen
Generator-Patches erhalten. Für einen PHOLY-APK-Build ist kein erneutes
Generieren der serverseitigen OpenAPI-Spezifikation erforderlich: Die
SDK-Generierung verwendet `open-api/immich-openapi-specs.json` aus dem
Checkout. DCM 1.39.1 ist für die zusätzliche vorhandene DCM-Analyse vorgesehen;
es ist keine Voraussetzung des APK-Buildskripts.

## 3. Build vorbereiten

Alle Befehle in diesem Abschnitt beginnen im Repository-Hauptverzeichnis.
Toolchain und benötigte Downloads zunächst auf dem isolierten Buildrechner
bereitstellen. Dann:

```bash
export CI=true
export FLUTTER_SUPPRESS_ANALYTICS=true
export DART_SUPPRESS_ANALYTICS=true
bash mobile/scripts/prepare-pholy.sh
```

[prepare-pholy.sh](scripts/prepare-pholy.sh) führt in dieser Reihenfolge aus:

1. Flutter-Version prüfen und den vorhandenen Dart-OpenAPI-Client mit den
   Repository-Patches generieren.
2. Flutter-Abhängigkeiten mit `flutter pub get --enforce-lockfile` auflösen
   und den vorhandenen Build-Runner-Patch anwenden.
3. Den nativen Rust-FFI-Kern mit `cargo build --locked` bauen und seine
   Dart-Bindings mit ffigen erzeugen.
4. Lokale Drift-Migrationshilfen und Schema-Testklassen, Build-Runner-Dateien
   sowie Pigeon-Plattformschnittstellen generieren.
5. Übersetzungen, Launcher-Symbole und native Startbildschirme erzeugen.

Die Drift-Schritte erzeugen lokalen Quellcode; sie führen keine Migration an
der produktiven PHOLY-Datenbank aus. Auf macOS erfolgt die CocoaPods-Installation
zusätzlich nach Abschnitt 8. Nach Änderungen an generierungsrelevanten
Dateien muss die Vorbereitung erneut ausgeführt werden.

Die PHOLY-Bitmap-Assets liegen bereits im Repository. Nur wenn das originale
Weblogo geändert wird, müssen sie mit installiertem Inkscape erneut aus den
SVGs gerendert werden:

```bash
python3 mobile/scripts/generate_pholy_icons.py
bash mobile/scripts/prepare-pholy.sh
```

Der Generator verwendet die bestehenden PHOLY-SVGs; ursprüngliche Immich-
Lizenz- und Bilddateien werden dadurch nicht pauschal entfernt.

## 4. Signierte Android-Testversion bauen

### Kennungen und parallele Installation

| Variante | Android-Paketkennung | Zweck |
| --- | --- | --- |
| PHOLY-Testrelease | `de.pholy.app.test` | Installierbare, separat signierte Android-Test-APK; Anzeigename „PHOLY Test“ |
| PHOLY-Debug | `de.pholy.app.debug` | Lokale Entwicklung und isolierter Emulator-Test |
| PHOLY-Releasebasis | `de.pholy.app` | Vorgesehene eigenständige PHOLY-App; keine Store-Veröffentlichung in diesem Auftrag |

Die Testversion ersetzt weder die ursprüngliche Immich-App noch die spätere
PHOLY-Produktionsapp. Sie besitzt ihren eigenen lokalen App-Speicher und
eigene Android-Berechtigungen. Bei Anmeldung an `pholy.de` greift sie jedoch
auf dieselben serverseitigen Konten und Fotos zu. Änderungen nach einer
echten Anmeldung wirken daher auf die vorhandene Plattform.

### Externe Signierung

Die folgenden Variablen müssen durch eine geschützte lokale Buildumgebung
oder einen Secret-Speicher bereitgestellt werden. Diese Dokumentation
enthält absichtlich keine Werte:

| Variable | Bedeutung |
| --- | --- |
| `PHOLY_ANDROID_KEYSTORE` | Absoluter Pfad zur vorhandenen, lesbaren, nicht leeren Test-Keystoredatei außerhalb des gesamten Repositorys |
| `ALIAS` | Alias des Signierungsschlüssels innerhalb dieses Keystores |
| `ANDROID_KEY_PASSWORD` | Passwort des Schlüssels |
| `ANDROID_STORE_PASSWORD` | Passwort des Keystores |

Schlüsseldatei und gegebenenfalls externe Umgebungsdatei nur für den
Buildbenutzer lesbar halten. Keine Passwörter als Shell-Befehlsargumente,
in Protokolle, APK-Metadaten oder Git übernehmen. Für Updates derselben
Testinstallation muss derselbe Signierungsschlüssel erhalten bleiben.
Das Skript bricht bei fehlenden Variablen, einem unbrauchbaren Keystore
oder einem Schlüsselpfad im Repository vor dem Build ab.

Nach erfolgreicher Vorbereitung und Bereitstellung der vier Variablen:

```bash
bash mobile/scripts/build-pholy-android.sh
```

[build-pholy-android.sh](scripts/build-pholy-android.sh) setzt
`PHOLY_ANDROID_TEST_BUILD=true`, löst Abhängigkeiten mit gesperrter Lockdatei
auf und baut signierte Release-APKs für **arm64** und **x86_64**. Es erzwingt:

```text
PHOLY_SERVER_URL=https://pholy.de
PHOLY_ENABLE_PASSKEYS=false
build-name=3.4.1-pholy-mobile.2
build-number=3040202
```

`3040202` ist die an Flutter übergebene **Basisbuildnummer**. Beim bestehenden
`--split-per-abi`-Build erhöht Flutter den Android-`versionCode` standardmäßig
um den jeweiligen ABI-Zuschlag. Die fertigen APKs werden deshalb auf diese
abgeleiteten Werte geprüft:

| APK-Architektur | Basisbuildnummer | ABI-Zuschlag | Android-`versionCode` |
| --- | ---: | ---: | ---: |
| arm64-v8a | 3040202 | 2000 | **3042202** |
| x86_64 | 3040202 | 4000 | **3044202** |

Die sichtbare Versionsbezeichnung bleibt bei beiden APKs
`3.4.1-pholy-mobile.2`. Es wird keine Option zum Unterdrücken dieser
Flutter-Standardberechnung gesetzt.

Nur bei `PHOLY_ANDROID_TEST_BUILD=true` deaktiviert die Android-Konfiguration
`minifyEnabled` und `shrinkResources`. Die Testversion wird weiterhin als
**Release mit Flutter-AOT, nicht debuggable und signiert** gebaut. Java-/Kotlin-
Code bleibt unminifiziert und Android-Ressourcen werden nicht verkleinert;
dadurch fällt die APK größer aus. Diese gezielte Testbuild-Ausnahme vermeidet
den auf dem speicherbegrenzten Arbeitsplatz nicht abgeschlossenen R8-Schritt.
Die Optimierungsvorgaben regulärer Release-Builds bleiben unverändert.

Für die weiterzugebende Test-APK diesen PHOLY-Buildweg verwenden. Die
vorhandene allgemeine mise-Aufgabe `build:android` baut ein App-Bundle und
setzt die PHOLY-Test- und Signierungsprüfungen dieses Skripts nicht um.

Passkeys bleiben in dieser Testversion deaktiviert. Ihre Aktivierung setzt
die passende Zuordnung von Domain, Paketkennung und Signierungszertifikat
voraus. Die vorhandene OAuth-Callback-Kennung `app.immich:/oauth-callback`
bleibt aus Kompatibilitätsgründen erhalten; interne Dart-Paketnamen und
Android-Klassen-Namespaces sind ebenfalls nicht die installierte App-ID.

Nach einem erfolgreichen Build liegen die erwarteten Dateien hier:

```text
mobile/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk
mobile/build/app/outputs/flutter-apk/app-x86_64-release.apk
```

Jede Datei ist für ihre jeweilige Architektur einzeln installierbar. Es
entsteht kein App-Bundle und keine 32-Bit-ARM-APK. Der Buildordner allein
belegt noch keine bestandenen Tests; vor Weitergabe Paketkennung,
Versionsnummer, Signatur und SHA-256-Prüfsumme der konkreten Datei prüfen
und im Auslieferungsbericht festhalten. Auf knapp bemessenen Buildrechnern
Codegenerierung, Tests und Gradle-Build nacheinander ausführen.

### Optional: Debugbuild auf einem speicherbegrenzten Arbeitsplatz

Bei der bisherigen Debug-Buildprüfung wurde der speicherintensive Flutter-/native
Assemble-Schritt separat vor der Android-Paketierung ausgeführt. Codegenerierung,
Tests, Flutter/native Assemble und Gradle nacheinander laufen lassen; den Emulator
erst nach Abschluss der Compiler starten. `JAVA_HOME` muss dabei auf das
vollständige JDK mit `bin/java` und `bin/javac` zeigen.

Für diese Trennung die von `flutter build apk -v` protokollierten Assemble- und
Gradle-Aufrufe mit denselben Buildmodus-, Architektur-, Ausgabe- und
`dart-defines`-Werten verwenden. Der zweite Schritt darf nur auf passende,
erfolgreich erzeugte Assemble-Ausgaben zurückgreifen. Das reguläre
PHOLY-Buildskript bleibt unverändert.

Ein beobachteter zusätzlicher Engpass war `JetifyTransform` für das native
Flutter-Debug-Engine-JAR: Das x86_64-JAR enthält ausschließlich
`lib/x86_64/libflutter.so` mit rund 390 MB entpackter Größe. Mit dieser **lokalen**
Regel in `$GRADLE_USER_HOME/gradle.properties` sowie einem lokalen Gradle-Java-Heap
von 1536 MB und 512 MB DirectBuffer-Limit konnte die vollständige Debug-APK
erfolgreich gebaut werden:

```properties
android.jetifier.ignorelist=(armeabi_v7a|arm64_v8a|x86_64)_(debug|profile|release)-1[.]0[.]0-a804b261645ef8c13eb3d5c44a5c2fb0340c5539[.]jar$
```

Die Regel gilt nur für die nativen ABI-Engine-Artefakte dieses gepinnten
Flutter-Engine-Stands. `flutter_embedding_*`, Plugins und alle anderen
Abhängigkeiten bleiben im Jetifier-Verfahren. Jetifier nicht global abschalten;
Versionspins, Pluginquellen und Repository-Buildkonfiguration dafür nicht ändern.

Dies ist ein **beobachteter Debug-Workaround**. Inzwischen wurden auch die
ZIP-Zentralverzeichnisse der Release-Engine-JARs dieses Pins geprüft: ARM64 enthält
nur `lib/arm64-v8a/libflutter.so` (165.164.528 Bytes), x86_64 nur
`lib/x86_64/libflutter.so` (165.996.904 Bytes). Damit ist die rein native Struktur
für beide Release-ABIs ebenfalls belegt. Die Release-AOT-Kompilierung wurde für
beide ABIs erfolgreich abgeschlossen. Ein weiterer R8-Versuch mit G1GC und
2048 MB Java-Heap endete mit einem ausgefallenen Gradle-Daemon, bevor eine
vollständige APK vorlag. Für die erneute Testpaketierung wird daher die oben
beschriebene, ausschließlich für PHOLY-Testbuilds geltende Ausnahme ohne
Java-/Kotlin-Minifizierung und Resource Shrinking verwendet. Mit dieser
Konfiguration wurden die Test-1-Release-APKs beider ABIs vollständig paketiert,
signiert und statisch geprüft. Der historische Nachweis von Installation und
Laufzeitverhalten steht im [Test-1-Prüfbericht](PHOLY-MOBILE-TESTREPORT.md).
Diese Ergebnisse gelten für die dort genannten Dateien und Prüfsummen;
Test 2 benötigt eigene Build-, Signatur-, Installations- und Updatebelege.

## 5. Android installieren und starten

Voraussetzung ist Android **8.0 / API 26 oder neuer** und eine unterstützte
Architektur. Für übliche aktuelle Android-Telefone ist die arm64-Datei
vorgesehen; x86_64 dient insbesondere passenden Emulatoren.

1. Die zum Gerät passende APK aus der konkreten Testauslieferung auf das
   Gerät übertragen. Falls angefordert, die Installation aus dieser Quelle
   für den verwendeten Dateimanager oder Browser erlauben.
2. Die APK öffnen und **PHOLY Test** installieren. Alternativ mit eingerichtetem
   Android Debug Bridge aus dem Repository-Hauptverzeichnis:

   ```bash
   adb install -r mobile/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk
   ```

3. PHOLY Test öffnen. Die Einführung und Anmeldung verwenden `pholy.de`.
   Bestehende Zugangsdaten verwenden; eine Einladung beziehungsweise ein
   bestehender PHOLY-Zugang ist erforderlich.
4. Fotozugriff entsprechend der beabsichtigten Verwendung erlauben.
   Automatische Sicherung erst nach Auswahl der gewünschten Gerätealben
   und Prüfung der Upload-Einstellungen aktivieren.

`adb install -r` erhält beim Update mit derselben Kennung und Signatur den
lokalen App-Speicher. Bei einem Signaturkonflikt zuerst den verwendeten
Schlüssel und die installierte Variante prüfen. Eine Deinstallation ist
kein regulärer Update-Schritt und würde lokale Einstellungen und eventuell
noch nicht hochgeladene App-Daten entfernen.

### Von Test 1 auf Test 2 und spätere Updates

Test 1 enthält die neue Updatefunktion noch nicht. Die erste Installation
von Test 2 erfolgt deshalb durch Öffnen der passenden neuen APK oder mit
`adb install -r`. Dieselbe Paketkennung und derselbe externe Testschlüssel
sind Voraussetzung, damit die bestehende Installation übernommen wird.
Die beiden Test-2-APKs müssen denselben öffentlichen Zertifikatsfingerabdruck
wie Test 1 tragen:

```text
SHA-256: 508817d5ae05654119171066f8f23777093d15fc2cd8d1facef8735c9092f769
```

Test 2 ergänzt eine Updateprüfung für die Android-Testausgabe. Der öffentliche
Updatefeed und die APK-Dateien werden im vorhandenen Repository
`cluckmann-web/pholy-source` bereitgestellt. Der Feed ist unter
`https://raw.githubusercontent.com/cluckmann-web/pholy-source/main/mobile/updates/android-test.json`
abrufbar. Dafür benötigt die App keine GitHub-Zugangsdaten. Die Nutzung der
PHOLY-Konten bleibt einladungsgebunden; öffentlich abrufbare App-Dateien
ändern diese Zugangsregel nicht.

Für eine Auslieferung zuerst den entsprechenden Quellstand und die endgültig
signierten APKs veröffentlichen und anonym prüfen. Erst danach den Feed mit
den konkreten ABI-Versionen, Dateigrößen, SHA-256-Prüfsummen und Downloadadressen
aktualisieren. Die Downloadadressen müssen auf unveränderte Dateien des
jeweiligen Release zeigen. Ein Feedwechsel ersetzt weder die Prüfung der
APK-Signatur noch einen Installationsnachweis.

Die Android-Installation bleibt eine ausdrückliche Aktion des Nutzers mit
dem Systemdialog. Falls Android die Berechtigung zum Installieren aus PHOLY
verlangt, wird sie für diese Quelle erteilt. Android-APK-Updates sind kein
iOS-Verteilungsweg; dessen Build- und Signierungsvoraussetzungen stehen in
Abschnitt 8.

Bei paralleler Nutzung mehrerer Foto-Apps bewusst festlegen, welche App
welche Gerätealben automatisch hochlädt. Die separate Test-Paketkennung
erzeugt keine getrennten serverseitigen Fotos oder Konten.

## 6. PHOLY-API, Community und Fotokommentare

Die neue Community-Anbindung und die Fotokommentare verwenden den bestehenden
nativen HTTP-Client mit dessen aktueller Sitzung und Netzwerkkonfiguration.
Es gibt keinen zweiten Login oder zusätzlichen Token-Speicher. Die
ursprüngliche Immich-Albumaktivität unter `/api/activities` bleibt bestehen.
PHOLY-Fotokommentare sind eine eigene Erweiterung unter
`/api/pholy/comments/:assetId`.

### Strikte Diskussionskontexte

| Diskussion | Übertragener Kontext | Geltungsbereich |
| --- | --- | --- |
| Privat | `{"kind":"private"}` | Private Diskussion des Fotobesitzers |
| Album | `{"kind":"album","albumId":"…"}` | Diskussion genau dieses Albums für berechtigte Mitglieder |
| Community | `{"kind":"community","profileSlug":"…"}` | Diskussion des im betreffenden veröffentlichten Profil freigegebenen Fotos |

**Beim Kommentar-Endpunkt heißt das Community-Feld `profileSlug`, niemals
`slug`.** Der Community-Profil-Endpunkt selbst verwendet weiterhin seine
vorhandenen `slug`-Felder. Auch wenn ein Foto in mehreren Kontexten dieselbe
Asset-ID hat, werden Diskussionen, Ladezustand und Entwürfe nicht vermischt.

| Operation | Methode und Pfad | Kontextübertragung |
| --- | --- | --- |
| Kommentare laden | `GET /api/pholy/comments/:assetId` | Query; zusätzlich `offset` |
| Kommentar oder Antwort anlegen | `POST /api/pholy/comments/:assetId` | JSON mit `body` und optional `parentId` |
| Bearbeiten | `PATCH /api/pholy/comments/:assetId/:commentId` | JSON mit `body` |
| Löschen | `DELETE /api/pholy/comments/:assetId/:commentId` | Query |
| Liken | `PUT /api/pholy/comments/:assetId/:commentId/like` | JSON |
| Like entfernen | `DELETE /api/pholy/comments/:assetId/:commentId/like` | Query |
| Kommentaravatar laden | `GET /api/pholy/comments/:assetId/authors/:userId/avatar` | Query |

Die App zeigt Namen, Avatare, Zeitangaben, Antworten und Likes. Die
Serverantwort entscheidet über `canComment`, `canEdit` und `canDelete`;
der Client stellt diese Rechte nicht selbst her. Nicht angemeldete Nutzer
können keine Kommentare verändern. Die Kommentar-API verlangt auch zum
Lesen eine persönliche PHOLY-Sitzung und akzeptiert weder API-Schlüssel
noch anonyme Freigabelinks. HTTP 401, 403 oder 404 entfernt einen
nicht mehr zugänglichen Thread einschließlich seines Entwurfs. Auch der
Server prüft Kontext und Berechtigung bei jeder Operation.

Kommentare sind unmittelbar in der Fotoansicht erreichbar. Aus- und
Einblenden erhält den Entwurf **für dasselbe Foto, denselben Kontext und
dasselbe Konto**. Wechsel von Foto, Kontext oder Konto setzt ihn zurück.
Entwürfe werden nicht dauerhaft gespeichert. Ausgeblendete oder im
Hintergrund befindliche Kommentaransichten pausieren ihre Aktualisierung;
bei sichtbarer aktiver Ansicht erfolgt sie alle 30 Sekunden. Die bestehende
Albumaktivität bleibt über ihre eigene Aktion zugänglich.

Community-Verzeichnis und Profilgalerien verwenden
`/api/pholy/community/profiles`. Öffentliche Bilder werden ausschließlich
über `/api/pholy/community/profiles/:slug/assets/:assetId` geladen. Es gibt
keinen Rückfall auf den privaten Originaldatei-Endpunkt. Die eigene
Fotoauswahl bleibt authentifiziert; das Veröffentlichen eines Profils ist
eine ausdrückliche Aktion mit den ausgewählten Fotos. Ein Kontowechsel
verwirft offene Community-Bearbeitungs- und Meldeansichten, damit keine
Aktion mit einer inzwischen anderen Sitzung abgeschickt wird.

Die maßgeblichen Implementierungen befinden sich in
[lib/pholy/comments](lib/pholy/comments) und
[lib/pholy/community](lib/pholy/community); der private Viewer wird in
[asset_viewer.page.dart](lib/presentation/widgets/asset_viewer/asset_viewer.page.dart)
integriert. Bestehende API-Identifikatoren und generierte Immich-Verträge
bleiben erhalten.

## 7. Berechtigungen, Synchronisierung und Hintergrundbetrieb

Die vorhandenen Upload-, Synchronisierungs- und Backup-Dienste werden
weiterverwendet. Auswahl der Gerätealben und Einstellungen zu Netz und
Ladezustand bestimmen die automatische Sicherung; die neue Community-
Oberfläche veröffentlicht nicht automatisch die gesamte Bibliothek.

**Android:** Das Manifest enthält Foto-/Videomedienzugriff einschließlich
der neueren Auswahl einzelner Medien, ältere Speicherberechtigungen nur
bis API 32, Medienstandortzugriff, Benachrichtigungen, Netzwerk-/WLAN-Zugriff
und die vorhandenen Standort-/Hintergrunddienstberechtigungen. Die
Standortfunktionen werden unter anderem für die WLAN-Erkennung verwendet;
der Medienstandortzugriff betrifft Original-Metadaten. Welche Abfragen
erscheinen, hängt von Android-Version und genutzter Funktion ab. Begrenzter
Fotozugriff begrenzt entsprechend die sichtbaren und sicherbaren Medien.
Die native Hintergrundverarbeitung verwendet weiterhin WorkManager und
die zugehörige Foreground-Service-Infrastruktur. Akkuoptimierung,
Netzbedingungen und Herstellerbeschränkungen können den Zeitpunkt der
Ausführung beeinflussen.

**iOS:** Die vorhandenen Hinweise für Fotozugriff, Kamera, Mikrofon, Face ID,
lokales Netzwerk und die WLAN-bezogene Standortabfrage bleiben den jeweiligen
Funktionen zugeordnet. Für Hintergrund-Uploads sind `fetch` und `processing`
sowie die Kennungen
`$(PRODUCT_BUNDLE_IDENTIFIER).background.refreshUpload` und
`$(PRODUCT_BUNDLE_IDENTIFIER).background.processingUpload` eingerichtet.
Der native Code registriert diese dynamisch beim BGTaskScheduler. Der
tatsächliche Ausführungszeitpunkt wird von iOS bestimmt; eine feste
Upload-Frist oder ein dauernd laufender Prozess wird nicht zugesichert.

Berechtigungsdialoge, eingeschränkter Fotozugriff, Geräte-Neustart,
Prozessbeendigung und Hintergrund-Uploads müssen zusätzlich auf den
Zielgeräten mit freigegebenen synthetischen Medien geprüft werden. Ein
Widgettest oder ein Emulator-Smoke-Test ersetzt diese Betriebssystemprüfungen
nicht.

## 8. iOS vorbereiten und signieren

Ein iOS-Build benötigt einen **Mac mit einer zu Flutter 3.47.2 passenden
Xcode-Installation**, deren Command Line Tools und iOS-SDKs sowie CocoaPods
1.16.2. Die konkrete verwendete Xcode-Version ist beim ersten iOS-Build im
Prüfbericht festzuhalten; dieses Repository legt dafür keine bereits
verifizierte Version fest. Die Hauptapp hat ein Deployment Target von
iOS 15.0, die Share Extension von iOS 16.0 und das Widget von iOS 17.0.

Für eine auf Geräten installierbare signierte Version fehlen auf einem
reinen Linux-/Android-Buildplatz insbesondere die Apple-Buildumgebung,
eine berechtigte Apple-Developer-Teamkonfiguration, die zugehörigen
Zertifikate samt privaten Schlüsseln und passende Provisioning Profiles.
Bei einer Ad-hoc-Verteilung müssen die Testgeräte im jeweiligen Profil
enthalten sein. Diese Anleitung veröffentlicht nichts im App Store.

### Kennungen und lokale Konfiguration

| Release-Ziel | Kennung |
| --- | --- |
| Hauptapp | `de.pholy.app` |
| Widget | `de.pholy.app.Widget` |
| Share Extension | `de.pholy.app.ShareExtension` |
| Gemeinsame App Group | `group.de.pholy.app.share` |

Die zugehörigen App-IDs und Fähigkeiten müssen im selben Apple-Team
verfügbar sein. App Group, benötigte Hintergrundfähigkeiten, Associated
Domains und die vorhandenen Entitlements müssen zu den Profilen passen.
Das Projekt nennt `applinks:pholy.de` und `webcredentials:pholy.de`;
funktionierende Universal Links beziehungsweise spätere Passkeys brauchen
zusätzlich die passende Domain-Zuordnung auf PHOLY.

[ios/Signing.xcconfig](ios/Signing.xcconfig) enthält die öffentlichen
Kennungen und eine leere Team-ID. Entwickler legen die von Git ignorierte
Datei **`mobile/ios/Signing.local.xcconfig`** für lokale Überschreibungen an.
Die unterstützten Variablennamen heißen aus Upstream-Kompatibilitätsgründen
weiterhin `IMMICH_TEAM_ID`, `IMMICH_BUNDLE_ID_PROD`, `IMMICH_BUNDLE_ID_DEV`
und `IMMICH_GROUP_ID`. Team-ID lokal ergänzen, die vorgesehenen PHOLY-
Kennungen beibehalten. Zertifikatsschlüssel und Profile außerhalb von Git
im vorgesehenen macOS-/CI-Signierungsspeicher verwalten.

Debug und Profile ergänzen automatisch `.debug` beziehungsweise `.profile`
an der Basiskennung und App Group; bei den Erweiterungen folgt danach
`.Widget` oder `.ShareExtension`. Diese Varianten benötigen bei echter
Gerätesignierung passende eigene Registrierungen.

### Buildweg auf dem Mac

Die gemeinsame Vorbereitung nach Abschnitt 3 auch auf dem Mac ausführen.
Bei Installation von Flutter über die vorhandene mise-Konfiguration läuft
der Repository-Patch `ios/scripts/xcode_flutter_patch.sh` als Postinstall-
Schritt. Er betrifft den Simulator-Aufruf von Xcode. Bei manueller
Flutter-Installation dessen SDK-Pfadbehandlung prüfen; das Skript erwartet
die von mise verwendete Verzeichnisstruktur.

Anschließend im Verzeichnis `mobile/`:

```bash
cd ios
pod install --deployment
cd ..
flutter build ios --release --no-codesign \
  --dart-define=PHOLY_SERVER_URL=https://pholy.de \
  --dart-define=PHOLY_ENABLE_PASSKEYS=false \
  --build-name=3.4.1 --build-number=3040202
```

Dies beschreibt eine **unsignierte Kompilierungsprüfung**, keine auf einem
iPhone installierbare Auslieferung. Für einen Gerätebuild danach
`ios/Runner.xcworkspace` in Xcode öffnen, Team und Profile für alle drei
Ziele konfigurieren und mit der vorgesehenen Testverteilung archivieren.
Eine automatisierte signierte IPA kann nach Einrichtung des Signings mit
`flutter build ipa --release` und einer extern verwalteten, zur
Verteilungsart passenden `--export-options-plist` erzeugt werden; dieselben
Server-/Passkey-Defines und Versionsargumente sind dabei zu übergeben.

**iOS benötigt `--build-name=3.4.1 --build-number=3040202`.** Der Android-
Versionsname `3.4.1-pholy-mobile.2` darf nicht unverändert als
`CFBundleShortVersionString` übernommen werden. Widget und Share Extension
verwenden eigene Xcode-Versionswerte: `MARKETING_VERSION=3.4.1` und
`CURRENT_PROJECT_VERSION=3040202` sind für Debug, Release und Profile
gesetzt. Bei Versionswechseln die numerischen Flutter-Argumente der Hauptapp
und diese Werte beider Erweiterungen gemeinsam aktualisieren und vor dem
Archivieren abgleichen. Gemeinsamer Dart-Code,
native Projektanpassungen und dokumentierte Befehle sind noch kein Beleg
für einen erfolgreichen iOS-Build oder Gerätestest.

## 9. Prüfungen nachvollziehbar ausführen

Nach vollständiger Codegenerierung können im Verzeichnis `mobile/` die
gezielten PHOLY-Tests und die statische Analyse ausgeführt werden. Für
direkte Werkzeugaufrufe dieselben CI-/Analytics-Variablen wie in Abschnitt 3
setzen und den Rust-Pin 1.99.1 verwenden:

```bash
export RUSTUP_TOOLCHAIN=1.99.1
flutter test --no-pub --concurrency=1 \
  test/services/pholy_auth.service_test.dart \
  test/pholy/community.service_test.dart \
  test/pholy/community_widget_test.dart \
  test/pholy/photo_comment_service_test.dart \
  test/pholy/photo_comments_widget_test.dart \
  test/pholy/viewer_comments_test.dart
dart analyze --fatal-infos
```

Die Tests prüfen unter anderem API-Pfade und Kontextfelder,
Berechtigungsdarstellung, Antworten/Bearbeiten/Löschen/Likes, den Erhalt
gleichartiger Entwürfe beim Einblenden, deren Trennung bei Foto-/Kontext-/
Kontowechsel, veraltete Antworten, kleine Ansichten, große Schrift und
Tastaturwechsel. Die Ausführung und ihre Ergebnisse sind separat zu
protokollieren; ein fehlgeschlagener Test muss als solcher erkennbar bleiben.

Der zusätzliche
[Android-Smoke-Test](integration_test/pholy_mobile_smoke_test.dart) verwendet
einen HTTP-Fixture-Server ausschließlich im Emulator auf dessen Loopback-
Adresse. Er verbindet die echte App-Oberfläche mit nativer HTTP-Sitzung,
lokaler Synchronisierung, Upload und Fotoansichten. Er erwartet zwingend
einen dedizierten Android-Emulator und eine separate Debug-/Test-Paketkennung.
Auf einem Emulator mit passenden synthetischen Daten, nach Vorbereitung:

```bash
flutter test -d emulator-5554 \
  integration_test/pholy_mobile_smoke_test.dart \
  --dart-define=PHOLY_SERVER_URL=http://127.0.0.1:17415 \
  --dart-define=PHOLY_ENABLE_PASSKEYS=false
```

Die Gerätekennung bei Bedarf an den dedizierten Emulator anpassen. Die
Loopback-URL darf niemals für den zu verteilenden Release-Build übernommen
werden; dessen Skript erzwingt `https://pholy.de`. Der Smoke-Test darf
weder mit Produktionszugängen noch auf einem Gerät mit echten Benutzerdaten
ausgeführt werden. Sein Startschutz prüft URL, Plattform, Paketkennung und
Emulatorstatus, bevor er App-Daten vorbereitet.

### Smoke-Test mit vorab gebauter APK

Bei wenig Arbeitsspeicher den Emulator während des Debug-Builds geschlossen
halten. Im Verzeichnis `mobile/` zunächst die Test-APK bauen:

```bash
flutter build apk --debug --no-pub \
  --target-platform android-x64 \
  --target=integration_test/pholy_mobile_smoke_test.dart \
  --dart-define=PHOLY_SERVER_URL=http://127.0.0.1:17415 \
  --dart-define=PHOLY_ENABLE_PASSKEYS=false
```

Danach erst den dedizierten x86_64-Emulator starten und den vorhandenen
Hosttreiber verwenden:

```bash
set -o pipefail
flutter --verbose drive --no-pub -d emulator-5554 \
  --driver=test_driver/pholy_smoke_driver.dart \
  --target=integration_test/pholy_mobile_smoke_test.dart \
  --use-application-binary=build/app/outputs/flutter-apk/app-debug.apk \
  2>&1 | tee build/pholy-smoke-drive.log
```

`--use-application-binary` verwendet die bereits gebaute APK und kompiliert
sie nicht erneut. Deshalb müssen Testtarget und Loopback-Define schon beim
Vorbuild stimmen. Diese Debug-APK ist ausschließlich für die synthetische
Prüfung vorgesehen und darf nicht mit der signierten PHOLY-Testauslieferung
verwechselt werden.

Der Smoke-Test ist für Anmeldung, Synchronisierung, Fotoanzeige,
synthetischen Upload und getrennte Fotodiskussionen ausgelegt. Seine
Ergebnisdatei und Screenshots werden im externen App-Verzeichnis unter
`pholy-smoke-evidence` abgelegt. Beim Drive-Weg legt der
[Hosttreiber](test_driver/pholy_smoke_driver.dart) zusätzliche Kopien unter
`$FLUTTER_TEST_OUTPUTS_DIR/pholy-smoke-evidence` auf dem Buildrechner ab;
ohne diese Variable ist es `build/pholy-smoke-evidence`. Mit
`PHOLY_SMOKE_OUTPUT_DIR` lässt sich das Zielverzeichnis ausdrücklich setzen.
Auch bei einem Fehler kann ein Teilbericht entstehen. Ein Erfolg verlangt
`passed`, `flowCompleted` und `teardownCompleted` jeweils als `true`,
`teardownFailure: null` und `frameworkFailureCount: 0`. Der Hosttreiber
verwirft fehlende oder fehlerhafte Abschlüsse. Zusätzlich muss das native
Flutter-Protokoll nach allen Teardowns eine Zeile
`I/flutter … All tests passed!` enthalten und darf kein
`Some tests failed.` melden. Der Exit-Code allein und die ähnlich lautende
Hostdriver-Zeile `All tests passed.` reichen beim gepinnten SDK nicht aus.
Der isolierte CI-Runner prüft diese Bedingungen ausdrücklich.

Für den dokumentierten KVM-Emulatorlauf verwendet der Runner außerdem
`--no-dds --no-enable-impeller --enable-software-rendering`. Diese Optionen
betreffen ausschließlich die synthetische Debug-Prüfung. Der getrennte
Installations- und Startnachweis der signierten Release-APK verwendet den
regulären App-Renderer ohne diese Overrides. Logische Testgrößen werden
über `setSurfaceSize` auf die unveränderte native Android-Surface
eingepasst; `screenshotDetails` hält beide Größen und die PNG-Auflösung fest.

Nicht abgedeckt sind echte Mailzustellung, produktive Benutzerkonten,
reale Foto-Berechtigungsdialoge, vom
Betriebssystem nach Prozessbeendigung ausgelöste Uploads sowie iOS.

Für die praktische Freigabe zusätzlich dokumentieren: Start und Anmeldung,
Upload eines synthetischen Fotos, Synchronisierung und erneutes Öffnen,
Foto-/Albumansicht, drei getrennte Kommentarkontexte, erlaubte und gesperrte
Aktionen, Entwurf bei Aus-/Einblenden, Abmelden/Kontowechsel, Hell/Dunkel,
Rotation und Betriebssystemberechtigungen. Keine Testnachrichten an reale
Nutzer senden und keine realen Benutzerdaten verändern.

## 10. Quellcode, Lizenzen und Auslieferung

PHOLY enthält angepassten Immich-Code unter der GNU AGPL Version 3. Der
vollständige Text bleibt in [LICENSE](../LICENSE) erhalten und wird in der
App zusätzlich aus `assets/AGPL-3.0.txt` in die Lizenzanzeige eingebunden.
[assets/PHOLY-SOURCE.txt](assets/PHOLY-SOURCE.txt) nennt die Herkunft und den
entsprechenden mobilen Quellverweis. Abhängigkeitslizenzen und die nativen
[NOTICES](../native/native_core/NOTICES) bleiben Bestandteil des Quellstands.
Originale Copyright-Vermerke nicht durch reines Umbenennen entfernen.

Vor Weitergabe einer modifizierten APK den vollständigen dazugehörigen
Quellstand einschließlich Änderungen, Lockdateien und dieser Buildanleitung
unter dem im Release-Manifest genannten öffentlichen Verweis bereitstellen.
Für die Nachvollziehbarkeit gehören Releaseversion, tatsächlicher Git-
Commit, verwendete Toolchain, Paketkennung, Signatur-Zertifikatsfingerabdruck,
APK-Prüfsummen und der konkrete Prüfbericht zur Auslieferung. Private
Signierungsschlüssel, Passwörter und Produktionsdaten gehören nicht dazu.

Versionsänderungen konsistent in `pubspec.yaml`,
`PHOLY-MOBILE-RELEASE.json`, dem Android-Buildskript und dem gebündelten
Quellhinweis nachziehen. Die mobile Testversion ändert nicht automatisch
die Versionsnummer oder den laufenden Release der PHOLY-Webplattform.
