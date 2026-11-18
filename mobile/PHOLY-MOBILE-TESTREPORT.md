# PHOLY Mobile – Prüfbericht der Android-Testbuilds

**Berichtsstand: 18. November 2026, 03:45 UTC.**

Die mobile Testsuite ist mit **1.682 bestandenen Tests und einer bereits
vorbestehend übersprungenen Suite** abgeschlossen. Die statische Analyse
meldet **„No issues found!“**. Die Debug-APK für den isolierten Android-
Smoke-Test und die **Release-Test-APKs für arm64 und x86_64 sind vollständig
gebaut**. Die Release-APKs haben die statische Prüfung ihrer Metadaten,
Signaturen, enthaltenen ABIs und ZIP-Ausrichtung bestanden. Ihre gemessenen
Größen und SHA-256-Prüfsummen stehen in Abschnitt 7.

**Installation und ausgeführter Android-Geräteflow sind zum Berichtsstand
noch nicht nachgewiesen.** Die statische APK-Prüfung ersetzt diese
Laufzeitprüfungen nicht. Die nachfolgenden Abschnitte unterscheiden
abgeschlossene Prüfungen und noch ausstehende Schritte.

## 1. Zugeordneter Quell- und Versionsstand

| Merkmal | Dokumentierter Stand |
| --- | --- |
| Mobile Version | `3.4.1-pholy-mobile.1` |
| Basis-Buildnummer | `3040201`; ABI-spezifische APK-`versionCode` siehe unten |
| Bestehende PHOLY-Plattformbasis | `3.4.1-pholy.16` |
| Öffentlicher Basiscommit | `3902eeb36c0a61ff0cccc307091b07d776b0193a` |
| Öffentlicher mobiler Commit auf `main` | `712866de80697c8351feb21f6be748fda54d4feb` |
| Zugeordneter privater Commit auf `main` | `53dc7269c3155c06fa0d8990963bf11f205e41ba` |
| Gemeinsamer dokumentierter Git-Dateibaum | `387c24cfb344af98589dc2fa81363cf48ff55f05` |
| Android-Testkennung laut Buildkonfiguration | `de.pholy.app.test` |
| Debugkennung für isolierte Prüfung | `de.pholy.app.debug` |
| Vorgesehene PHOLY-Releasekennung | `de.pholy.app` |

Die öffentlichen Quellen sind dem
[öffentlichen Commit](https://github.com/cluckmann-web/pholy-source/commit/712866de80697c8351feb21f6be748fda54d4feb)
zugeordnet. Das private Entwicklungsrepository verwendet den
[zugeordneten privaten Commit](https://github.com/cluckmann-web/pholy/commit/53dc7269c3155c06fa0d8990963bf11f205e41ba).
Unterschiedliche Commit-IDs können denselben Git-Dateibaum beschreiben.

Der lokale Abgleich des öffentlichen Basiscommits mit dem genannten mobilen
Commit ergibt ausschließlich Änderungen unter **`mobile/`**. Die
Mobile-Implementierung führt keinen neuen Server, keine zusätzlichen
Benutzerkonten und keine serverseitige Fotodatenbank ein. Ein Deployment der
produktiven Webseite ist kein Bestandteil dieses mobilen Prüflaufs.

Nach diesem veröffentlichten Quellstand wurden im Build-Arbeitsstand noch
die Builddokumentation, eine JDK-Vorprüfung des Android-Buildskripts und
die ausschließlich für Android-Testbuilds geltende Abschaltung von R8-
Minifizierung und Ressourcenverkleinerung ergänzt. Auch dieser Bericht
entsteht danach. Der Dart-Anwendungscode wurde seit der bestandenen
Testsuite nicht verändert. Die zusätzlichen Buildänderungen müssen vor der
endgültigen Auslieferung in deren Quellreferenz aufgenommen werden.
Die oben genannten Commit-IDs sind daher **noch nicht die abschließende
Quellzuordnung der erzeugten APKs**.

### Basis-Buildnummer und gemessene APK-Versionscodes

Flutter 3.47.2 ergänzt bei `--split-per-abi` standardmäßig einen ABI-
spezifischen Aufschlag zur übergebenen Basis-Buildnummer. Dieser bestehende
Flutter-Mechanismus wurde beibehalten. Die folgenden Werte wurden
zusätzlich aus den fertiggestellten APKs ausgelesen:

| APK-Architektur | Basis | ABI-Aufschlag | Gemessener `versionCode` |
| --- | --- | --- | --- |
| `arm64-v8a` | `3040201` | `2000` | **`3042201`** |
| `x86_64` | `3040201` | `4000` | **`3044201`** |

Beide APKs haben denselben gemessenen Versionsnamen
`3.4.1-pholy-mobile.1`. Für iOS bleibt die numerische Basis-Buildnummer
`3040201` vorgesehen; die Android-ABI-Aufschläge werden dort nicht verwendet.

Versionen und Kennungen: [PHOLY-MOBILE-RELEASE.json](PHOLY-MOBILE-RELEASE.json).
Reproduktions- und Installationsanleitung: [PHOLY-MOBILE.md](PHOLY-MOBILE.md).

## 2. Erreichte und offene Prüfschritte

| Prüfschritt | Status zum Berichtsstand | Konkreter Beleg beziehungsweise Grenze |
| --- | --- | --- |
| Vollständige mobile Flutter-Testsuite | **Abgeschlossen** | `mobile-all-tests-final.log`: `03:27 +1682 ~1: All tests passed!` |
| Statische Analyse des mobilen Projekts | **Abgeschlossen** | `mobile-analyze-final.log`: `Analyzing mobile...` / `No issues found!` |
| PHOLY-Kommentar-, Community- und Authentifizierungsprüfungen | **In der bestandenen Suite enthalten** | Tests unter `test/pholy/` und `test/services/pholy_auth.service_test.dart` |
| Bestehende Viewer-Systemleistenprüfung nach Korrektur | **Bestanden** | In der finalen Gesamtsuite enthalten; zusätzlicher gezielter Lauf dokumentiert |
| Android-x86_64-Debug-Assemblierung mit Flutter und nativen Build-Hooks | **Abgeschlossen** | `flutter-assemble-debug.log`: `Running build hooks for android_x64 done.`, `build succeeded.`, `exiting with code 0` |
| Vollständige Debug-APK einschließlich Android-/Kotlin-/Gradle-Paketierung | **Abgeschlossen** | `android-debug-build-package.log`: `BUILD SUCCESSFUL in 1m 39s`, 954 Tasks; APK mit 176.608.049 Bytes vorhanden |
| Flutter-Release-/AOT-Assemblierung für arm64 und x86_64 | **Abgeschlossen** | `flutter-assemble-release.log`: native Hooks für beide ABIs, `build succeeded.`, Exit 0; 242.551 ms |
| Release-Test-APK-Paketierung für beide ABIs | **Abgeschlossen** | `android-release-build-verbose.log`: `BUILD SUCCESSFUL in 9m 25s`, 1.266 Tasks; Flutter-Abschluss mit Exit 0 |
| Android-Release-Lint | **Bestanden** | `:app:lintVitalAnalyzeRelease`, `:app:lintVitalReportRelease` und `:app:lintVitalRelease` im erfolgreichen Release-Build ausgeführt |
| Synthetischer Android-Emulator-Smoke-Test | **Noch ausstehend** | Test und Fixture vorhanden; noch kein ausgeführter Geräteflow nachgewiesen |
| Signierte PHOLY-Test-APKs für arm64 und x86_64 | **Erstellt und statisch geprüft** | Beide APKs mit gültiger APK-v2-Signatur; identisches Zertifikat stimmt mit dem externen PHOLY-Testkeystore überein |
| Prüfung von APK-Kennung, Version, Signatur, ABI, ZIP-Ausrichtung und SHA-256 | **Bestanden** | `release-verification/20261118T034457Z-2/verification-result.json`: `success: true`; Einzelwerte in Abschnitt 7 |
| Installation, Start und Update einer signierten Test-APK | **Noch ausstehend** | Kein entsprechender Installationsnachweis vorhanden |
| Tests auf physischer Android-Hardware | **Nicht durchgeführt** | Foto-Berechtigungen und Betriebssystem-Hintergrundbetrieb noch offen |
| iOS-Build, Signierung und Geräteprüfung | **Nicht durchgeführt** | Gemeinsamer Code und Konfiguration vorhanden; Apple-Buildumgebung und Signing noch erforderlich |

Die vollständigen Arbeitsprotokolle liegen im isolierten Build-Arbeitsbereich
unter `tooling/`. Ihre Dateinamen dienen hier zur Belegzuordnung. Dieser
Bericht gibt die maßgeblichen Ergebniszeilen wieder; er behauptet keine
öffentliche Veröffentlichung dieser Protokolldateien.

### Vorbestehender Test-Skip

`test/modules/map/map_theme_override_test.dart` ist bereits in der
Plattformbasis mit folgender Suite-Markierung versehen:

```dart
@Skip('Flaky test, needs investigation')
```

Der finale Lauf weist diese eine Suite als übersprungen aus. Sie wurde
nicht für die PHOLY-Änderung neu deaktiviert. Ihr Karten-Theme-Verhalten
zählt deshalb nicht zu den in diesem Lauf erfolgreich ausgeführten
Prüfungen.

### Zusätzliche Diagnose im erfolgreichen Testlauf

Das finale Testprotokoll enthält zweimal die Flutter-VM-Diagnose
„Callbacks into the Dart VM are currently prohibited“ mit einem Hinweis
auf Typed-Data-Zugriffe beziehungsweise Finalizer. Der Testlauf beendet
sich trotzdem mit den oben genannten 1.682 bestandenen Tests und ohne
fehlgeschlagenen Test. Die konkrete Ursache dieser Diagnose ist in diesem
Bericht nicht geklärt. Aus der Meldung wird weder ein bestandener
Gerätebetrieb noch ein nachgewiesener Fehler auf einem Android-Gerät
abgeleitet.

## 3. Was die abgeschlossenen Tests abdecken

Die bestandene Gesamtsuite umfasst bestehende mobile Tests sowie die
PHOLY-Ergänzungen. Die folgenden Aussagen beziehen sich auf **automatisierte
Host-, Service- und Widgettests mit ihren Testdaten**, nicht auf bereits
abgeschlossene Prüfungen der installierten Android-App.

| Bereich | Im Testcode geprüfte Eigenschaften |
| --- | --- |
| PHOLY-Anmeldung und Passwort-Wiederherstellung | Vorhandene Status-/Recovery-Endpunkte, Verfügbarkeit entsprechend Mail- und Passwortkonfiguration, bereinigte E-Mail als Request-Inhalt, Rate-Limit-Behandlung und keine irrtümliche Erfolgsmeldung bei unerwarteten Antworten |
| Fotokommentar-Verträge | Unterschiedliche Schlüssel und Payloads für `private`, `album` und `community`; Community-Kontext verwendet `profileSlug`; Pfade und Methoden für Laden, Erstellen, Antworten, Bearbeiten, Löschen und Likes |
| Kommentarberechtigungen | Keine Schreiboberfläche für anonyme Nutzer; Bearbeiten/Löschen gemäß Serverrechten; Reaktion auf entzogene Zugriffsrechte; keine Anzeige alter Inhalte und Rechte gelöschter Kommentare |
| Entwürfe und Aktualisierung | Entwurf bleibt beim Aus-/Einblenden desselben Fotos bestehen; Foto-, Kontext- und Kontowechsel trennen den Zustand; verspätete Antworten des vorherigen Fotos bleiben ausgeschlossen; Aktualisierung pausiert bei ausgeblendeter Ansicht und im Hintergrund |
| Community und Medien | Öffentliche Vorschau-Endpunkte ohne privaten Originaldatei-Fallback; authentifizierte eigene Fotoauswahl; ausdrückliche Veröffentlichung und Auswahl; Zurückziehen der Veröffentlichung löscht keine Fotos |
| Wechsel des Kontos | Alte Profilbearbeitung, Follow-Aktionen und noch offene Meldungen können nicht mit einer inzwischen anderen Sitzung versendet werden |
| Darstellung | Enge und breite Ansichten, dunkles Design, vergrößerte Schrift, Tastaturwechsel und kompakte Kommentarbereiche einschließlich mehrzeiliger Entwürfe |
| Bestehende Fotoansicht | Helle Statusleistensymbole über der dunklen Fotoansicht; lokale Fotos initialisieren keinen für sie unnötigen PHOLY-Kommentar-/Authentifizierungsgraphen |
| Vorhandene Daten- und Synchronisierungskomponenten | Bestehende Tests unter anderem für Repositories, lokale Datenhaltung, Synchronisierungsströme, Zuordnung von Assets und Zustandswechsel bleiben Bestandteil der Gesamtsuite |

Die konkreten PHOLY-Testfälle sind in [test/pholy](test/pholy) und im
[Recovery-Service-Test](test/services/pholy_auth.service_test.dart)
nachvollziehbar. Das Vorhandensein dieser Hosttests belegt insbesondere
**keinen** bereits praktisch durchgeführten Upload an `pholy.de` und keine
abgeschlossene automatische Sicherung im Betriebssystem-Hintergrund.

### Behobene Befunde vor dem finalen Lauf

Beim früheren Gesamtlauf scheiterte die Systemleistenprüfung der
Fotoansicht: Die neue Kommentar-Kontextprüfung las auch bei lokalen Fotos
den Auth-/API-Providergraph. Dieser war für die lokale Ansicht unnötig und
im vorhandenen Präsentationstest nicht eingerichtet. Die Ansicht wurde
dadurch nicht vollständig aufgebaut. Die Prüfung schließt ungeeignete
Assets jetzt vor dem Sitzungszugriff aus. Sowohl die bestehende
Systemleistenprüfung als auch der neue Test für den lokalen Viewer sind
im finalen erfolgreichen Lauf enthalten.

Die Passkey-Tests wurden an die absichtlich deaktivierte PHOLY-
Featurefreigabe angepasst und um die Prüfung dieses deaktivierten Zustands
ergänzt. **Passkey-Anmeldung ist damit nicht als freigegebene oder auf einem
Gerät getestete PHOLY-Funktion ausgewiesen.**

## 4. Buildumgebung und beobachtete Buildprobleme

Die vollständige Toolchain ist in [PHOLY-MOBILE.md](PHOLY-MOBILE.md)
dokumentiert. Für diesen Build-Arbeitsplatz sind insbesondere Flutter
3.47.2 mit Dart 3.13.2, Gradle 8.14, Rust 1.99.1 und das vollständige
**Eclipse Temurin JDK 21.0.2+13** eingerichtet. Vorhanden sind die
Android-Plattformpakete **33, 34, 35 und 36** sowie Build-Tools **35.0.0
und 36.0.0**. Das App-Projekt verwendet Compile-/Target-SDK 36 und NDK
28.2.13676358; Minimum ist Android API 26.

Die folgenden Probleme betreffen unterschiedliche Stufen des Buildwegs:

| Befund | Beleg | Bisherige Behebung und verbleibende Grenze |
| --- | --- | --- |
| Zu Beginn war für den ausgewählten Java-Pfad kein vollständiger Compiler verfügbar | `android-debug-build-retry.log`: `does not provide the required capabilities: [JAVA_COMPILER]` | Vollständiges Temurin JDK 21.0.2+13 eingerichtet. Das Buildskript prüft jetzt bei gesetztem `JAVA_HOME`, dass `bin/javac` ausführbar ist. |
| Benötigte Android-SDK-Bestandteile mussten ergänzt werden | Installierte Plattformverzeichnisse 33–36 und Build-Tools 35.0.0/36.0.0; nachfolgende Buildprotokolle | Die Pakete sind nun vorhanden. Ihre Installation allein ist kein APK-Erfolgsnachweis. |
| Gleichzeitig laufende Flutter-/Rust-, Gradle- und Emulatorprozesse belasteten den verfügbaren Speicher | Frühere Buildversuche brachen ab; nach der Trennung sind die Flutter-Assemblierungsschritte für Debug und Release mit Exit 0 abgeschlossen | Flutter-/Rust-Kompilierung, Gradle-Paketierung und Emulatorbetrieb wurden zeitlich getrennt. |
| Jetifier-Verarbeitung der großen nativen Flutter-Engine-JAR überschritt den Java-Heap | `android-debug-build-after-assemble.log`: `Java heap space` bei der Abhängigkeitsverarbeitung | Eine lokale enge Ignore-Regel nimmt ausschließlich native ABI-Engine-JARs des konkret verwendeten Flutter-Enginehashes aus. Nach ZIP-Inspektion enthalten diese nur `libflutter.so`; Java-Abhängigkeiten und Plugins bleiben in der Jetifier-Verarbeitung. |
| 128 MiB direkter Java-Pufferspeicher reichten bei der APK-Paketierung nicht | `android-debug-build-native-ignore-online.log`: `Cannot reserve ... bytes of direct buffer memory`, Limit 134.217.728 Bytes | Das lokale Limit wurde auf 512 MiB erhöht. Der vollständige Debug-APK-Build ist danach erfolgreich abgeschlossen. |
| Ein weiterer Releaseversuch mit G1 und 2.048 MiB Heap brach nach 248,8 Sekunden ab | `android-release-build-g1.log`: `Gradle build daemon disappeared unexpectedly`; zuletzt etwa 1,6 GiB belegter Heap im zugehörigen GC-Protokoll | Daraus wird kein Kotlin-Anwendungsfehler abgeleitet. Für die Testauslieferung wurde anschließend nur die Java-/Kotlin-Minifizierung und Ressourcenverkleinerung deaktiviert; der folgende Release-Testbuild wurde erfolgreich abgeschlossen. |

Für den erfolgreichen Vorbuild wurde
`integration_test/pholy_mobile_smoke_test.dart` im Debugmodus für
`android-x64` mit `PHOLY_SERVER_URL=http://127.0.0.1:17415` assembliert.
`flutter-assemble-debug-command.json` dokumentiert diesen konkreten Aufruf.
Das zugehörige Protokoll bestätigt die nativen Android-x64-Build-Hooks,
Asset-Erzeugung und den erfolgreichen Flutter-Abschluss.

Die nachfolgende Debug-Paketierung ist durch
`android-debug-build-package.log` mit `BUILD SUCCESSFUL in 1m 39s`
belegt. Die Datei `build/app/outputs/flutter-apk/app-debug.apk` hat
176.608.049 Bytes und ist ausschließlich für den isolierten Smoke-Test
bestimmt.

Für den Testrelease wurde dagegen **`lib/main.dart` im Release-/AOT-Modus
für `android-arm64` und `android-x64`** assembliert. Die nativen Hooks für
beide ABIs und der Abschluss mit Exit 0 sind in
`flutter-assemble-release.log` belegt; Dauer: 242.551 ms. Die vollständige
APK-Paketierung folgte erfolgreich: `assembleRelease` wurde nach 566,2
Sekunden abgeschlossen, der gesamte Flutter-APK-Aufruf nach 568.189 ms
mit Exit 0. Beleg: `android-release-build-verbose.log`.

Der erfolgreiche Paketbuild verwendete lokal 1.536 MiB Java-Heap und
512 MiB direkten Pufferspeicher. Die genannte Jetifier-Ausnahme ist auf
native Engine-JARs mit dem Hash
`a804b261645ef8c13eb3d5c44a5c2fb0340c5539` begrenzt. Die Auflösung von
AndroidX-Test-Metadaten wurde außerdem über eine lokale Gradle-Init-
Konfiguration auf das Google-Repository beschränkt. Dabei wurden keine
Abhängigkeitsversionen geändert. Diese Anpassungen betreffen den isolierten
Buildrechner.

### Bewusste Abweichung ausschließlich im Testbuild

Im Block `PHOLY_ANDROID_TEST_BUILD=true` von
[android/app/build.gradle](android/app/build.gradle) sind
`minifyEnabled false` und `shrinkResources false` gesetzt. Dadurch entfällt
für diese Testauslieferung die R8-Minifizierung von Java-/Kotlin-Code und
die Ressourcenverkleinerung. Die Auslieferungsartefakte enthalten keine
durch diese beiden Schritte erzielte Verkleinerung. Ein Größenvergleich
mit einer erfolgreich optimierten Ausgabe liegt nicht vor.

**Flutter-Release-/AOT-Kompilierung, externe Signierung und die nicht
debuggbare Android-Releaseeigenschaft bleiben erhalten.** Die tatsächlichen
APKs wurden zusätzlich auf `debuggable: false` und ihre Signaturen geprüft.
Die allgemeine Releasekonfiguration außerhalb des PHOLY-Testblocks wurde
in diesen Optimierungseinstellungen nicht verändert.

Der normale Android-Release-Lint-Schritt wurde nicht deaktiviert:
`lintVitalAnalyzeRelease`, `lintVitalReportRelease` und `lintVitalRelease`
wurden im erfolgreichen Paketbuild ausgeführt. Ein erfolgreicher
Store-Release mit aktivem R8 ist damit weiterhin nicht nachgewiesen und
gehört nicht zu dieser Testauslieferung.

## 5. Vorbereiteter Android-Smoke-Test – Ausführung noch ausstehend

Der Gerätefluss ist in
[pholy_mobile_smoke_test.dart](integration_test/pholy_mobile_smoke_test.dart)
implementiert. Die
[HTTP-Fixture](integration_test/test_utils/pholy_smoke_fixture.dart)
läuft im selben Testprozess ausschließlich auf der Emulator-Loopback-
Adresse `http://127.0.0.1:17415`. Es werden synthetische Kontodaten,
synthetische Kommentare und ein im Test erzeugtes Bild verwendet.

Der Startschutz prüft vor der Vorbereitung des App-Zustands:

- die fest einkompilierte Loopback-Serveradresse,
- Android als Plattform,
- `de.pholy.app.debug` oder `de.pholy.app.test` als Paketkennung,
- einen Emulator anstelle eines physischen Geräts.

Der vorbereitete Test verwendet die echte App-Oberfläche, den nativen
HTTP-Transport, Authentifizierungszustand, Drift-Datenhaltung, Upload-Dienst
und Routing. Er ersetzt deren Anwendungskomponenten nicht durch reine
UI-Attrappen. **Das beschreibt seinen Prüfaufbau; zum Berichtsstand liegt
noch kein erfolgreicher Ausführungsnachweis dieses Geräteflusses vor.**

### Für die Ausführung vorgesehene Prüfpunkte

1. Automatische Serververbindung und Anmeldung ohne sichtbares Serverfeld;
   leere Eingaben und falsches Passwort werden zurückgewiesen.
2. Synthetische Passwort-Wiederherstellung mit neutraler
   Annahmebestätigung; erfolgreiche Anmeldung und PHOLY-Einführung.
3. Remote-Synchronisierung über den vorhandenen Stream, Bestätigungen an
   den Fixture-Server und Speicherung in Drift; Darstellung der Galerie.
4. Öffnen der vorhandenen Fotoansicht und privater Kommentare;
   Erhalt des Entwurfs beim Aus-/Einblenden.
5. Multipart-Upload mit tatsächlichen synthetischen Bildbytes und
   Zeitangaben; anschließend erneute Synchronisierung des hochgeladenen
   Assets.
6. Getrennte albumbezogene Diskussion ohne Übernahme privater Kommentare
   oder Entwürfe.
7. Community-Verzeichnis, Profil, Follow-Aktion und öffentliche Vorschau;
   ausschließlich erlaubte Bearbeitungs-/Löschaktionen.
8. Kommentar, Antwort und Like im Community-Kontext sowie Bearbeitung und
   bestätigtes Löschen eines eigenen Kommentars.
9. Dunkles Design, schmale Telefonansicht und breite geteilte Ansicht;
   Erhalt des Entwurfs bei einem Layoutwechsel.
10. Schreibgeschützte Diskussion, deaktivierte Schreib-/Like-Aktionen,
    Trennung beim Fotowechsel und abschließende Prüfung aller drei
    Request-Kontexte einschließlich `profileSlug`.

Die Debug-APK ist nun vollständig gebaut. Ihre Ausführung über den vorhandenen
[Hosttreiber](test_driver/pholy_smoke_driver.dart) mit
`--use-application-binary` vorgesehen. Dadurch muss Gradle nicht gleichzeitig
mit dem Emulator laufen. Der Test erzeugt bei seiner Ausführung
Screenshots und ein Ergebnis-JSON; auch ein Teilbericht nach einem Fehler
muss zusammen mit dem Prozess-Exit-Code beurteilt werden. In diesem
Bericht werden solche noch nicht erzeugten Nachweise nicht als Ergebnisse
aufgeführt.

## 6. Noch nicht geprüfte reale Bedingungen

Die folgenden Punkte bleiben auch dann gesondert offen, wenn der
synthetische Emulator-Smoke-Test später erfolgreich abgeschlossen wird:

- Anmeldung mit einem realen produktiven Konto, produktive Synchronisierung
  und Uploads an `pholy.de`. Dieser Prüfansatz verändert keine echten
  Benutzerdaten und versendet keine Testkommentare an reale Nutzer.
- Tatsächliche SMTP-Zustellung und Öffnen einer echten
  Passwort-Wiederherstellungs-E-Mail.
- Native Medien-Berechtigungsdialoge und Auswahl einzelner Medien auf
  physischer Android-Hardware.
- Hintergrund-Uploads unter Akkuoptimierung, Netzwechsel, Gerätesperre,
  Neustart oder nach Beendigung des App-Prozesses.
- Installation, paralleler Betrieb mit Immich und einer späteren PHOLY-
  Produktionsapp sowie Updates einer wirklich signierten Test-APK.
- iOS-Kompilierung, Apple-Signierung, Share Extension, Widget und
  tatsächliches iPhone-/iPad-Verhalten.

Die iOS-Voraussetzungen sind konkret in der Buildanleitung beschrieben:
Mac und Xcode, CocoaPods, Apple-Team, Zertifikate und Provisioning Profiles,
die Kennungen `de.pholy.app`, `de.pholy.app.Widget` und
`de.pholy.app.ShareExtension` sowie `group.de.pholy.app.share`. Gemeinsamer
Flutter-Code und vorhandene Projektdateien allein belegen keine erfolgreiche
iOS-Kompilierung. Für iOS sind die numerischen Versionsargumente
`--build-name=3.4.1 --build-number=3040201` vorgesehen.

## 7. Erzeugte und statisch geprüfte APKs

Die statische APK-Prüfung ist am **18.11.2026 um 03:44:57 UTC** erfolgreich
abgeschlossen. Beleg:
`tooling/release-verification/20261118T034457Z-2/verification-result.json`
mit `success: true`. Die Übergabedateien und das strukturierte Manifest
`PHOLY-Android-Test-Manifest.json` liegen im vorbereiteten lokalen
Auslieferungsordner `deliverables/pholy-android-test/`.

| Übergabedatei | Enthaltene native ABI | Gemessene Größe in Bytes | Gemessener `versionCode` |
| --- | --- | --- | --- |
| `PHOLY-Android-Test-3.4.1-1-arm64.apk` | ausschließlich `arm64-v8a` | **86.860.839** | **3042201** |
| `PHOLY-Android-Test-3.4.1-1-x64.apk` | ausschließlich `x86_64` | **89.940.865** | **3044201** |

Die ursprünglichen Builddateinamen sind
`app-arm64-v8a-release.apk` beziehungsweise `app-x86_64-release.apk`.
Die Übergabedateinamen ändern weder Inhalt noch Versionskennung.

**SHA-256 – arm64:**

```text
76aeaae5640c14cc1fef67893c6d7894db0ceb2926d25fab5983f41a2c0b5002
```

**SHA-256 – x86_64:**

```text
022214107fcfe535b3515dbdabf63fa9599774776cd2549e52c35dd67d5a03a1
```

### Gemessene Eigenschaften beider Release-Test-APKs

- Paketkennung **`de.pholy.app.test`**, Anzeigename **„PHOLY Test“**,
  Versionsname **`3.4.1-pholy-mobile.1`**.
- Minimum-SDK **26**, Target-SDK **36**, **nicht debugbar**.
- Jeweils die oben genannte einzelne native ABI.
- **Gültige APK-v2-Signatur** und identisches Signaturzertifikat beider
  Dateien. Das Verifikations-JSON weist `v2: true` und `v3: false` aus.
- Geprüfte ZIP-Ausrichtung mit **4-Byte-Dateiausrichtung und
  16-KiB-Ausrichtung nativer Einträge**. Dies ist eine statische
  Archiveigenschaft, kein Geräte- oder Betriebssystemtest.
- In beiden AOT-Bibliotheken ist die Zeichenfolge **`https://pholy.de`**
  vorhanden; der synthetische Testendpunkt **`127.0.0.1:17415`** ist nicht
  enthalten. Diese Prüfung durchsucht `libapp.so` und belegt noch keine
  tatsächlich ausgeführte Netzwerkverbindung.

**SHA-256 des gemeinsamen Signaturzertifikats:**

```text
508817d5ae05654119171066f8f23777093d15fc2cd8d1facef8735c9092f769
```

Das Zertifikat wurde zusätzlich mit dem **externen PHOLY-Testkeystore**
verglichen; beide APKs stimmen überein. Beleg:
`tooling/release-verification/signing-key-match.txt`. Private Schlüssel
oder Passwörter sind weder Bestandteil dieses Berichts noch des Manifests.

### Noch offene Auslieferungs- und Laufzeitnachweise

| Nachweis | Aktueller Stand |
| --- | --- |
| Öffentliche Downloadbereitstellung beziehungsweise abgeschlossene Übergabe | Noch ausstehend; lokale Übergabedateien sind vorbereitet |
| Android-Installation und App-Start | Noch ausstehend |
| Erfolgreicher synthetischer Geräteflow mit Protokoll | Noch ausstehend |
| Updateprüfung mit derselben Testsignatur | Noch ausstehend |
| Endgültiger entsprechender Quellcommit einschließlich Buildkorrekturen | Vor der Auslieferung zu aktualisieren |

Das Verifikationsskript führt keine Laufzeitprüfung durch und bestätigt
auch nicht die Veröffentlichung des im Manifest vorgesehenen
Quellrelease-Verweises (`source_publication_checked: false`). Nach
Abschluss der jeweiligen nächsten Schritte sind nur die konkret
beobachteten Installations-, Geräte- und Übergabeergebnisse nachzutragen.
Fehlschläge oder weiter offene Bedingungen erhalten einen eigenen Status.
Die vollständigen entsprechenden Quellen und Lizenzhinweise müssen mit
dem endgültigen Auslieferungsstand übereinstimmen.
