# PHOLY Mobile – Prüfbericht der Android-Testbuilds

**Berichtsstand: 18. November 2026, 12:22 UTC.**

Die mobile Testsuite ist mit **1.682 bestandenen Tests und einer bereits
vorbestehend übersprungenen Suite** abgeschlossen. Die statische Analyse
meldet **„No issues found!“**. Die Debug-APK für den isolierten Android-
Smoke-Test und die **Release-Test-APKs für arm64 und x86_64 sind vollständig
gebaut**. Die Release-APKs haben die statische Prüfung ihrer Metadaten,
Signaturen, enthaltenen ABIs und ZIP-Ausrichtung bestanden. Ihre gemessenen
Größen und SHA-256-Prüfsummen stehen in Abschnitt 7.

Der vollständige synthetische Android-Gerätetest ist **bestanden**:
sechzehn fachliche Prüfpunkte, dreizehn native Bildschirmaufnahmen,
erfolgreicher Test-Cleanup und der bestätigte abschließende Flutter-
Suiteerfolg. [Lauf 44300696699](https://github.com/cluckmann-web/pholy-source/actions/runs/44300696699)
prüft Anmeldung, Einführung, Remote-Sync mit Drift-Speicherung, Galerie,
private Kommentare, Entwurfserhalt, echten Multipart-Upload mit zwei
anschließenden Syncs, Albumtrennung, Communityprofil und Follow,
Kommentare/Antworten/Likes, erlaubtes Bearbeiten und bestätigtes Löschen,
dunkle schmale/breite Layouts sowie Schreibschutz. Alle Konten, Medien
und Diskussionen dieses Laufs sind synthetisch und auf den Emulator begrenzt.

Zusätzlich wurde die **unveränderte signierte x64-Release-APK** aus dem
privaten GitHub-Prerelease heruntergeladen, erneut geprüft, installiert
und regulär gestartet. Der abschließende Installationslauf ist vollständig
bestanden: Derselbe App-Prozess, die aktive und tatsächlich fokussierte
PHOLY-Activity sowie die vollständig gerenderte Anmeldung wurden nach
10 und 30 Sekunden nachgewiesen. Die App verwendet ihren regulären
Impeller-/OpenGLES-Renderer. **Die ARM64-APK wurde noch nicht auf
physischer Hardware geprüft. Reale Konto-, SMTP- und Hintergrundbedingungen
bleiben gesondert offen.**

## 1. Zugeordneter Quell- und Versionsstand

| Merkmal | Dokumentierter Stand |
| --- | --- |
| Mobile Version | `3.4.1-pholy-mobile.1` |
| Basis-Buildnummer | `3040201`; ABI-spezifische APK-`versionCode` siehe unten |
| Bestehende PHOLY-Plattformbasis | `3.4.1-pholy.16` |
| Öffentlicher Basiscommit | `3902eeb36c0a61ff0cccc307091b07d776b0193a` |
| Öffentlicher mobiler Buildquellcommit | `885474051d2cc72c7c6976ff28d5b308e2396a88` |
| Zugeordneter privater Buildquellcommit | `513b4474414a772ee41045a920c580915fce0f73` |
| Gemeinsamer dokumentierter Git-Dateibaum | `6cc881221ac317ba5c81f87794e1304ec5aa8319` |
| Quellrelease in beiden Repositories | `releases/pholy-mobile-3.4.1-test.1` |
| Android-Testkennung laut Buildkonfiguration | `de.pholy.app.test` |
| Debugkennung für isolierte Prüfung | `de.pholy.app.debug` |
| Vorgesehene PHOLY-Releasekennung | `de.pholy.app` |

Die öffentlichen Quellen sind dem
[öffentlichen Commit](https://github.com/cluckmann-web/pholy-source/commit/885474051d2cc72c7c6976ff28d5b308e2396a88)
zugeordnet. Das private Entwicklungsrepository verwendet den
[zugeordneten privaten Commit](https://github.com/cluckmann-web/pholy/commit/513b4474414a772ee41045a920c580915fce0f73).
Unterschiedliche Commit-IDs können denselben Git-Dateibaum beschreiben.

Der lokale Abgleich des öffentlichen Basiscommits mit dem genannten mobilen
Commit ergibt ausschließlich Änderungen unter **`mobile/`**. Die
Mobile-Implementierung führt keinen neuen Server, keine zusätzlichen
Benutzerkonten und keine serverseitige Fotodatenbank ein. Ein Deployment der
produktiven Webseite ist kein Bestandteil dieses mobilen Prüflaufs.

Dieser veröffentlichte Quellstand enthält auch die ergänzte
Builddokumentation, die JDK-Vorprüfung des Android-Buildskripts und die
ausschließlich für Android-Testbuilds geltende Abschaltung von R8-
Minifizierung und Ressourcenverkleinerung. Beide Repositories enthalten
denselben zugehörigen Dateibaum in den oben verlinkten Buildquellcommits.
`main` und der genannte Quellrelease enthalten zusätzlich die abschließenden
Test-, Dokumentations- und iOS-Metadatenkorrekturen. Das Auslieferungsmanifest
ordnet diese Nachträge gesondert zu; der Android-Buildquellcommit bleibt fest.
Der Dart-Anwendungscode wurde seit der bestandenen Testsuite nicht
verändert. Nach dem Android-Build ergänzte Korrekturen am Test-Harness,
an der Dokumentation und an den iOS-Versionsmetadaten verändern den
oben angegebenen Android-Buildquellstand und die APK-Inhalte nicht.

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
| Synthetischer Android-Emulator-Smoke-Test | **Vollständig bestanden** | 16 fachliche Prüfpunkte, 13 native Aufnahmen, fehlerfreier Harness-Cleanup und abschließender nativer Flutter-Suiteerfolg; Lauf 44300696699 |
| Signierte PHOLY-Test-APKs für arm64 und x86_64 | **Erstellt und statisch geprüft** | Beide APKs mit gültiger APK-v2-Signatur; identisches Zertifikat stimmt mit dem externen PHOLY-Testkeystore überein |
| Prüfung von APK-Kennung, Version, Signatur, ABI, ZIP-Ausrichtung und SHA-256 | **Bestanden** | `release-verification/20261118T034457Z-2/verification-result.json`: `success: true`; Einzelwerte in Abschnitt 7 |
| Öffentlicher Community-Verzeichnisvertrag auf `pholy.de` | **Lesend geprüft** | GET antwortet mit HTTP 200 und passender Struktur; zum Prüfzeitpunkt keine veröffentlichten Profile in der ersten Liste |
| Installation und Start der exakten signierten x64-Test-APK | **Bestanden** | Unveränderte APK, Installation `Success`, identische PID und aktive/fokussierte PHOLY-Activity bei 10/30 Sekunden; vollständige Anmeldung visuell geprüft; Lauf 44286087749 `success` |
| Update einer signierten Test-APK | **Nicht durchgeführt** | Eine bestehende Installation wurde nicht ersetzt |
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

### Lesender Abgleich des öffentlichen Community-Endpunkts

Am 18.11.2026 um 05:09 UTC wurde
`GET https://pholy.de/api/pholy/community/profiles?offset=0` ohne
Anmeldedaten ausschließlich lesend aufgerufen. Die Antwort hatte HTTP
200, den JSON-Inhaltstyp und `Cache-Control: no-store`; die Felder
`profiles` und `nextOffset` entsprachen dem mobilen Datenmodell. Die erste
Seite enthielt **null Profile**. Deshalb konnten über diesen Aufruf keine
gefüllte öffentliche Galerie und kein Vorschaubild geprüft werden. Diese
Fälle bleiben dem synthetischen Testaufbau zugeordnet. Es wurden weder
Profile veröffentlicht noch Benutzerdaten verändert. Der Prüfbeleg
`tooling/public-community-contract-check.json` enthält nur Status-,
Struktur- und Zählwerte, keine Profilnamen, Adressen oder Bilder.

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

## 5. Android-Smoke-Test – vollständiger Nachweis und Prüfgeschichte

### Lokale Emulatorumgebung

Die lokalen Versuche mit API 35 und API 29 liefen ohne KVM ausschließlich
mit Softwareemulation. Sie erreichten keine PHOLY-Installation. Nach
Speicherbegrenzung und zusätzlicher Prüfung der Android-Systemdienste
startete API 29 zwar, seine Systemoberfläche blieb jedoch zu langsam:
Das kontinuierliche Android-Protokoll des letzten Laufs enthält
`WATCHDOG KILLING SYSTEM PROCESS: Blocked in handler on ui thread (android.ui)`.
Android startete daraufhin sein Framework neu; die Vorbereitung brach mit
Exit 224 ab. Das ist ein belegter Fehler der Testumgebung vor der
App-Installation und kein beobachteter PHOLY-Absturz. Belege:
`android-emulator-run-api29-final.log`,
`android-evidence-api29/continuous-logcat.txt` und `runner-result.txt`.

Die weitere synthetische Geräteprüfung läuft deshalb isoliert auf einem
GitHub-gehosteten Ubuntu-Runner mit nachgewiesener KVM-Verfügbarkeit.
Der Testbranch `pholy-mobile-native-test` ergänzt einen Workflow und ein
Ausführungsskript sowie die unten erläuterten Korrekturen am Test-Harness
zum veröffentlichten Buildquellstand. Der Anwendungscode der zu prüfenden
App ist unverändert. Dieser Job
verwendet weder Produktionskonten noch den PHOLY-Release-Signierschlüssel.

### Erster ausgeführter Geräteversuch

[GitHub-Actions-Lauf 44240596327](https://github.com/cluckmann-web/pholy-source/actions/runs/44240596327)
erstellte die Debug-APK erfolgreich, installierte sie auf einem
Android-35-x86_64-Emulator mit KVM und startete die native App. Vier
Prüfpunkte wurden erreicht: voreingestellte Serveradresse ohne Serverfeld,
Validierung leerer Eingaben vor dem HTTP-Aufruf, synthetische
Passwort-Wiederherstellung und Ablehnung eines falschen Passworts.

Der folgende positive Login wurde noch nicht erreicht: Die Fixture
verzeichnete zwei Loginversuche, aber keinen erfolgreichen Login. Der
Integrationstest behielt nach dem Verbergen der nativen Tastatur das
zuvor fokussierte Eingabefeld im Flutter-Testbinding. Die zweite
`enterText`-Operation konnte deshalb an eine bereits geschlossene
Eingabeverbindung gehen. Das ist mit dem beobachteten Ablauf konsistent;
die ursprünglichen Request-Inhalte wurden nicht protokolliert.

Der korrigierte Tastaturhelfer setzt diesen Testbinding-Zustand zurück.
Zusätzlich prüft der Test die Controllerwerte vor dem Absenden und
protokolliert in der Fixture ausschließlich Gleichheitswerte, Typen,
Längen und Feldnamen, keine Zugangsdaten. Nach erfolgreicher Anmeldung
wartet er vor dem ersten Remote-Sync auf den lokalen Sync des
Login-Ablaufs. Ein Fehler-Screenshot entsteht vor dem App-Tear-down.
Diese Änderungen betreffen ausschließlich den Testaufbau. Die gezielte
Dart-Analyse der zwei geänderten Integrationstestdateien ist ohne Befund.

### Zweiter Geräteversuch und nachfolgende Verbindungsdiagnose

[Lauf 44245377340](https://github.com/cluckmann-web/pholy-source/actions/runs/44245377340),
Quellcommit `9f62a893739473d23093c3c2d53bea5cf2c529c8`, erreichte die
korrekte Anmeldung, die PHOLY-Einführung und den echten Remote-Sync mit
Bestätigung, Drift-Speicherung und aufgebauter Galeriekachel. Der erste
Fotoklick traf jedoch den darüberliegenden vorhandenen „Was ist neu?“-Dialog.
Der Test hatte bis dahin auf das vorhandene Kachel-Widget, nicht auf seine
tatsächliche Erreichbarkeit gewartet. Der korrigierte Harness schließt
nun die reale Skip-Aktion des Dialogs und prüft vor Taps `hitTestable`.

Anschließend brach der gesamte Host-Emulatorprozess 37.2.13 mit einem
`Segmentation fault` ab; ADB meldete das Gerät offline. Das ist ein
beobachteter Emulatorabsturz. Seine genaue Ursache ist ohne Host-Stacktrace
nicht bewiesen. Ein abschließendes Ergebnis-JSON konnte deshalb nicht mehr
vom Gerät abgeholt werden. Das vorhandene Protokoll belegt die oben
beschriebenen erreichten Schritte, keinen vollständigen Flow-Erfolg.

Die nächste Wiederholung war
[Lauf 44248912745](https://github.com/cluckmann-web/pholy-source/actions/runs/44248912745),
Quellcommit `6c1a2719178417f7fabeecc7e6a51f36d5b2cd4d`. Sie verwendete für
Flutter ausschließlich beim Teststart die unterstützten Flags
`--no-enable-impeller --enable-software-rendering`, atomare Teilberichte
und einen laufenden Transfer der Testnachweise aus dem Emulator. Die
Flags ändern weder APK noch Produktmanifest. Die Engine startete ihren
Dart-VM-Dienst; anschließend wurde die Debugverbindung über DDS geschlossen,
bevor der eigentliche PHOLY-Test begann. Der Lauf wurde beendet. Ein
Rendererfehler oder App-Absturz ist damit nicht nachgewiesen. Die fehlende
Testausführung zählt nicht als bestandener Geräteflow.

### Direkter VM-Replay und konkrete Fixture-Korrektur

[Lauf 44282237879](https://github.com/cluckmann-web/pholy-source/actions/runs/44282237879)
verwendete dasselbe bereits gebaute Fixture-APK mit SHA-256
`d1c0b7b7e380cfa6ff2f2bbe4561769944b590d64b3c06c38a3868a3ac2e39b2`.
Die Verbindung mit `--no-dds` gelang. Acht Prüfpunkte wurden abgeschlossen,
einschließlich erfolgreicher Anmeldung, Einführung, Drift-Sync, Galerie,
privater Fotoansicht und Entwurfserhalt beim Umschalten. Sechs Screenshots
und ein ehrlicher Teilbericht mit `passed: false` sind gesichert.

Der tatsächliche Uploaddienst übertrug eine Multipart-Anfrage mit 13.286
Bytes, dem Bild, `fileCreatedAt` und `fileModifiedAt`; der Erfolgscallback
lieferte die erwartete Asset-ID. Der anschließende Sync scheiterte mit
SQLite-Fremdschlüsselfehler 787. Die Fixture hatte identische Bildbytes
und damit denselben SHA-1-Wert unter zwei verschiedenen Asset-IDs
ausgeliefert. Das widerspricht der vorhandenen Eindeutigkeit von
`owner_id` und `checksum`: Die neue Zeile ersetzte lokal das ursprüngliche
Foto, auf das das Album weiterhin als Vorschaubild verwies.

Die korrigierte Fixture erzeugt ein zweites PNG mit tatsächlich anderen
Pixeln und passender Prüfsumme. Sie akzeptiert den Upload erst bei
vollständigen passenden Bildbytes und Zeitfeldern. Der Test verlangt
unverändert einen erfolgreichen Sync und prüft jetzt sogar zwei
aufeinanderfolgende erfolgreiche Syncs, beide Asset-IDs mit ihren echten
Prüfsummen sowie die sichtbare neue Galeriekachel. Zusätzlich ist die vom
vorhandenen Client aufgerufene, authentifizierte Tokenvalidierung in der
Fixture ergänzt. **Es wurde kein Produktfehler durch eine abgeschwächte
Assertion verdeckt und kein Anwendungscode geändert.**

Der folgende vollständige Testlauf
[44284154036](https://github.com/cluckmann-web/pholy-source/actions/runs/44284154036)
verwendete den korrigierten Testquellcommit
`8581286df79bf4aad390aef4c5b589b2cd042bd9`. Er erhielt eine begrenzte
Driver-Verbindungsfrist, atomare frühe Ergebnisberichte und zeitlich
begrenzte Android-Diagnosen. Build, Installation und VM-Verbindung waren
erfolgreich. Der Test scheiterte diesmal vor dem zweiten Login-HTTP-Aufruf:
Sein Wartehelfer prüfte die Klickbarkeit und ließ anschließend ungeprüft
einen weiteren Layoutframe zu. Während der nativen Tastaturanimation war
der gerade geprüfte Textfinder beim tatsächlichen Tap nicht mehr
erreichbar. Die normalen Loginfelder blieben anschließend sichtbar;
ein zusätzlicher Loginrequest oder ein Authentifizierungsfehler wurde
dabei nicht ausgelöst. Die Korrektur betrifft den Test-Wartehelfer:
Er wartet jetzt auf drei aufeinanderfolgende Prüfungen mit unveränderter
Geometrie und Tastaturhöhe und tippt genau einmal auf den zuletzt geprüften
Mittelpunkt. Der Anmeldebutton muss nach der ersten Antwort wieder aktiviert
sein. Der ungeprüfte Zwischenframe entfällt; die Prüfung verlangt weiterhin
exakt zwei Loginanfragen insgesamt und enthält keine zusätzliche Wiederholung.

Die Socket.IO-Fixture zeigte wiederholte Verbindungsversuche ohne
nachgewiesenen erfolgreichen Namespace-Connect. Login und Remote-Sync
liefen davon getrennt durch. Realtime-Verbindung ist für diesen Versuch
nicht als bestanden ausgewiesen; ein leerer `unexpectedRequests`-Zähler
allein würde dafür nicht genügen.

### Upload, Albumtrennung und öffentliche Interaktionen ausgeführt

[Lauf 44287960387](https://github.com/cluckmann-web/pholy-source/actions/runs/44287960387),
Quellcommit `3013f1ab00121adbf7cea201825ad27cebb385b1`, schloss zwölf
Prüfpunkte ab. Genau zwei Loginanfragen führten nach dem absichtlich
falschen Passwort zu einer erfolgreichen Anmeldung. Ein Multipart-Upload
mit 13.537 Bytes enthielt das vollständige zweite Testbild und beide
Zeitfelder. Beide nachfolgenden Syncs waren erfolgreich; ursprüngliches
und hochgeladenes Foto blieben mit verschiedenen korrekten Prüfsummen
in Drift erhalten, und die Galerie zeigte beide Bilder.

Auch die Trennung der Albumdiskussion, Communityprofil und Follow sowie
öffentlicher Kommentar, Antwort mit `parentId` und Like mit sichtbarem
Zähler wurden ausgeführt. Die Fixture erfasste insgesamt drei Syncs mit
21 Bestätigungen, keine ungültigen Kontextanfragen, keine unzulässige
Mutation, keine unerwartete Route und keinen Fixturefehler.

Der anschließende Bearbeitungsschritt scheiterte am Testhelfer: Nach dem
Einfügen einer Antwort lag der eigene Kommentar unterhalb des sichtbaren
Bereichs der lazy aufgebauten Liste. Sein Menü war zuvor nachweislich
vorhanden gewesen. Der Helfer wartete zuerst auf einen aufgebauten Eintrag
und konnte deshalb dessen zum Aufbau erforderliches Scrollen nicht mehr
erreichen. Es wurde noch keine PATCH- oder DELETE-Anfrage gesendet.
Neun reguläre Screenshots, der abschließende Android-Screenshot und der
unveränderte Fehlerbericht sind gesichert. Das Ergebnisartefakt
`14419604911` hat die SHA-256
`a9baec97ed7b908eb40c188d14f61bd066cad47ccb35ecce0ff78f485fca188c`.
Der Lauf bleibt mit `passed: false` und Exitcode 1 dokumentiert.

Der korrigierte Harness scrollt vor beiden eigenen Menüaktionen gezielt im
`Scrollable` der PHOLY-Kommentarliste, begrenzt auf zwölf Schritte von
je 140 Pixeln. Ein noch nicht aufgebauter Eintrag muss dafür vorher nicht
gefunden werden. Nach dem bestätigten Löschen wartet der Test außerdem auf
das Ende des Mutations- und Neuladezyklus, bevor er die Abwesenheit des
Kommentars prüft. Produktcode und bestehende Assertions bleiben unverändert.
Die gezielte Analyse der Integrationstestdateien ist ohne Befund. Die
vollständige Wiederholung erfolgte in
[Lauf 44291563140](https://github.com/cluckmann-web/pholy-source/actions/runs/44291563140)
mit Quellcommit `d11edde623eee5800e60afa4dc4047fc20065b2b`.

### Berechtigte Autorenaktionen und Aufnahmegrenze des Test-Viewports

Dieser Lauf schloss dreizehn Prüfpunkte ab. Der eigene Kommentar wurde
über die sichtbare Menüaktion bearbeitet (`PATCH`) und nach der echten
Bestätigungsabfrage gelöscht (`DELETE`). Die Fixture erfasste jeweils eine
solche Mutation; die gespeicherten Bilder zeigen anschließend drei statt
vier Kommentare. Ungültige Kontexte, unerwartete Requests und
Fixturefehler blieben bei null.

Die Aufnahme `10-community-dark-wide` begann am 18.11.2026 um
11:18:17 UTC und wurde vor dem zwölfminütigen Testtimeout nicht fertig.
Die davor liegenden Größen-, Entwurfs- und Overflow-Assertions waren
ausgeführt. Android und App-Prozess blieben aktiv. Elf normale Aufnahmen
einschließlich `08-community-comments` und `09-community-dark-small`
liegen vor; die breite Aufnahme und die folgenden Prüfungen fehlen.
Artefakt `14423252150` hat SHA-256
`72abfc367947307c11529f2c44a712b9f49ba48d6829054f262fa70125e5ee31`.

Der SDK-Treiber gab in diesem Timeoutfall trotz unvollständigem Flow
Exitcode 0 aus. Der zusätzliche CI-Guard prüfte `pholySmoke.passed` und
bewertete den Lauf korrekt mit Exitcode 1 als fehlgeschlagen. Der
Hostdriver verlangt künftig auch bei direkter manueller Verwendung selbst
einen vollständig abgeschlossenen Flow, nachdem er die Belege gespeichert
hat. Ein bloßes SDK-„All tests passed“ reicht als Abschluss nicht aus.

Die Quellprüfung des gepinnten Integration-Test-SDKs zeigt einen passenden
Aufnahmemechanismus: `setSurfaceSize` passt simulierte logische Layouts
auf die unveränderte native Android-Surface ein. Der vorherige direkte
`physicalSize`-Override änderte dagegen die Flutter-Konfiguration, während
die Android-ImageView ihre reale Größe behielt. Das ist eine
quellgestützte Erklärung des Capture-Hängers; ein nativer Stack-Sample
dieser Warteposition liegt nicht vor. Die Korrektur nutzt `setSurfaceSize`,
prüft die tatsächliche Seitengröße und begrenzt Surface-Konvertierung und
Aufnahme jeweils auf 20 Sekunden. Metadaten unterscheiden logische
Layoutgröße, native Gerätemetriken und tatsächliche PNG-Abmessungen.

Die frühe dunkle Aufnahme zeigt einige Aktionsfarben noch im vorherigen
Zustand; der spätere Android-Finalscreen zeigt dieselben Aktionen korrekt
mintfarben. Die frühe Aufnahme gilt deshalb nicht als abschließender
Kontrastnachweis und belegt keinen dauerhaften Themefehler.

Ein gezielter zusätzlicher Host-Diagnosetest hat anschließend die tatsächlich
gerenderten Farben nach vollständig abgeschlossenem Hell-/Dunkelwechsel
und erneut nach einem Größenwechsel geprüft. Zurück, Melden, Einklappen,
Like und Antwort verwenden dann `#9BD9C8`, die nächste Fotoaktion
`#CDE8DF`, das Menü Weiß und das Senden-Symbol `#0B221D`. Ein Test ist
bestanden; es wurde keine Produktdatei geändert. Beleg:
`tooling/theme-contrast-probe.log`. Der native Harness wartet vor beiden
dunklen Aufnahmen zusätzlich auf die wirksamen Toggle-/Send-Glyphfarben
und zwei stabile Farbproben. Die Wiederholung mit diesen Korrekturen erfolgte
unter [44297420646](https://github.com/cluckmann-web/pholy-source/actions/runs/44297420646),
Quellcommit `73ec0781200c393ccd925e7ec3473e029a320367`.

### Vollständiger Funktionsfluss und nachgelagerter Test-Cleanupfehler

Dieser Lauf schloss alle **16 fachlichen Prüfpunkte und 13 native Aufnahmen**
ab. Die Bilder belegen den korrekten Mint-Kontrast im dunklen Design,
den erhaltenen Entwurf in der schmalen und breiten Ansicht sowie das zweite
Foto mit deaktiviertem Like, ausgeblendetem Composer und Schreibschutzhinweis.
Die simulierten logischen Größen 360 × 740 und 1000 × 700 sind von der
unveränderten nativen PNG-Auflösung 720 × 1280 getrennt dokumentiert.
Der breite Aufbau wird auf diese native Surface eingepasst; die schwarzen
Randflächen sind Teil dieses dokumentierten Testaufbaus.

Die Fixture erfasste zwei Loginversuche mit einer erfolgreichen Anmeldung,
drei Syncs mit 21 Bestätigungen, einen vollständigen PNG-Upload mit
13.537 Multipart-Bytes und beide Datumsfelder. Kommentaroperationen:
27 GET, zwei POST sowie jeweils ein PUT, PATCH und DELETE. Ungültige
Kontexte und unzulässige Mutationen waren null; unerwartete Requests
und Fixturefehler waren leer. Artefakt `14425206558` hat SHA-256
`299799aa3c9cb38ef781f9957859a35dfca385d359e821fbf64ab2c18f2e3f95`.

Nach dem erfolgreichen Testbody entsorgte das gepinnte Flutter-Testbinding
regulär den Widgetbaum und dessen ProviderScope. Der zusätzliche
`addTearDown`-Zugriff auf denselben Container scheiterte deshalb mit
`Bad state: Tried to read a provider from a ProviderContainer that was already disposed`.
Das native Testprotokoll meldete **`Some tests failed.`**. Der SDK-Driver
meldete trotzdem Erfolg, und GitHub beendete den Job mit `success` und
Exitcode 0. Diese tatsächlichen CI-Werte bleiben erhalten; die unabhängige
Gesamtbewertung dieses Laufs lautet **fehlgeschlagener Flutter-Testabschluss**.
Ein grüner CI-Status ersetzt hier nicht die Prüfung des Abschlussprotokolls.

Die anschließende Korrektur entfernt den redundanten Providerzugriff nach
regulärem Unmount. Sie erfasst Flow, Test-Cleanup und Frameworkfehler getrennt.
Driver und Runner müssen diese Abschlüsse zusätzlich prüfen; der Runner
verlangt den tatsächlichen nativen Flutter-Suiteabschluss und verwirft
die Fehlermeldung auch bei irreführendem SDK-Exitcode 0. Produktcode,
Fachprüfungen und ausgelieferte Android-APKs werden dabei nicht verändert.

### Abschließender vollständiger Android-Gerätetest

[Lauf 44300696699](https://github.com/cluckmann-web/pholy-source/actions/runs/44300696699)
mit Quellcommit `0d88f0d2bfb615218dfb6e3dce2fbffbfda47221` ist vollständig
mit **`success` und Exitcode 0** abgeschlossen. Die echten GitHub-Runfelder
sind in `workflow-result.json` gesichert und mit Run-ID sowie Quellcommit
des nativen Ergebnisberichts abgeglichen. Das Belegartefakt `14426891240`
hat 3.872.124 Bytes und SHA-256
`7985322910433a53d7de525fef228efe1e6654a3df53db72f946166c442a8fb3`.

Der Driverbericht enthält `flowCompleted: true`, `teardownCompleted: true`,
`teardownFailure: null`, `frameworkFailureCount: 0` und `passed: true`.
Das native Flutter-Protokoll endet tatsächlich mit **`All tests passed!`**;
es enthält keinen negativen Suiteabschluss. Der Runner bestätigt die
Driver-Verbindung, den Zustand `synthetic-flow-completed` sowie seinen
eigenen abgeschlossenen Shell-Cleanup. Diese drei Ebenen – Fachfluss,
Flutter-Abschluss und Runner – sind getrennt geprüft.

**Alle 16 fachlichen Prüfpunkte und 13 Screenshots sind vollständig.**
Die Aufnahmen wurden visuell geprüft: deutsche und englische Anmeldung,
Recovery und Einführung, Galerie einschließlich des hochgeladenen zweiten
Bildes, private/Album-/Community-Diskussionen, dunkle schmale/breite Ansicht
und Schreibschutz. Die dunklen Bedienelemente haben den korrekten
Mint-Kontrast; der Entwurf bleibt beim Layoutwechsel erhalten. Die breite
Darstellung verwendet den dokumentierten logischen Test-Viewport,
keinen physischen Tablet- oder Rotationstest.

| Native Messung | Ergebnis |
| --- | --- |
| Loginanfragen / erfolgreiche Anmeldung | 2 / 1 |
| Tokenvalidierung | 4 authentifizierte Anfragen |
| Synchronisierung / Bestätigungen | 3 / 21 |
| Upload | 1 Multipart-Anfrage mit 13.537 Bytes; vollständiges erwartetes PNG und beide Datumsfelder bestätigt |
| Kommentaroperationen | 26 GET, 2 POST, 1 PUT, 1 PATCH, 1 DELETE |
| Ungültige Kontexte / unzulässige Mutationen | 0 / 0 |
| Unerwartete Requests / Fixturefehler | jeweils leer |
| Abgeschlossene native Bildschirmaufnahmen | 13; Aufnahmestatus jeweils `complete` |

Stream-Sync und lokaler Datenbankzustand sind damit nachgewiesen.
Ein erfolgreicher Socket.IO-Realtime-Namespace-Connect wird durch diese
Fixture weiterhin nicht belegt. Frühere fehlgeschlagene Testabschlüsse
bleiben in der Prüfgeschichte unverändert dokumentiert.

### Prüfaufbau

Der Gerätefluss ist in
[pholy_mobile_smoke_test.dart](integration_test/pholy_mobile_smoke_test.dart)
implementiert. Die
[HTTP-Fixture](integration_test/test_utils/pholy_smoke_fixture.dart)
läuft im selben Testprozess ausschließlich auf der Emulator-Loopback-
Adresse `http://127.0.0.1:17415`. Es werden synthetische Kontodaten,
synthetische Kommentare und zwei im Test erzeugte Bilder verwendet.

Der Startschutz prüft vor der Vorbereitung des App-Zustands:

- die fest einkompilierte Loopback-Serveradresse,
- Android als Plattform,
- `de.pholy.app.debug` oder `de.pholy.app.test` als Paketkennung,
- einen Emulator anstelle eines physischen Geräts.

Der Test verwendet die echte App-Oberfläche, den nativen
HTTP-Transport, Authentifizierungszustand, Drift-Datenhaltung, Upload-Dienst
und Routing. Er ersetzt deren Anwendungskomponenten nicht durch reine
UI-Attrappen. **Der vollständige synthetische Geräteflow einschließlich
Testabschluss ist im oben zugeordneten finalen Lauf bestanden.**

### Ausgeführte Funktionsbereiche

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

Die Debug-APK wird über den vorhandenen
[Hosttreiber](test_driver/pholy_smoke_driver.dart) mit
`--use-application-binary` ausgeführt. Dadurch muss Gradle nicht gleichzeitig
mit dem Emulator laufen. Der Test erzeugt bei seiner Ausführung
Screenshots und ein Ergebnis-JSON; auch ein Teilbericht nach einem Fehler
muss zusammen mit dem Prozess-Exit-Code beurteilt werden. In diesem
Bericht werden Teilnachweise und noch offene Prüfpunkte getrennt ausgewiesen.

### Exakte signierte Release-APK: Installation und normaler Start

Der private
[Lauf 44286087749](https://github.com/cluckmann-web/pholy/actions/runs/44286087749)
ist mit **`success`** abgeschlossen. Sein CI-Commit ist
`6038d0f5364626b4babd438c74425810f2d3234a`; das Belegartefakt hat die ID
`14419756111` und die SHA-256
`41764a2e9bde3b5aa164b7a02651cb99a8ac9c2e062cb39e3f5761d11e737b13`.

Der Job lud die vorhandene x64-APK aus dem privaten Testrelease und
bestätigte erneut ihre exakte SHA-256, Größe, Paketkennung, Version,
ABI, Releaseeigenschaft sowie v2-Signatur und Zertifikat. **Die APK wurde
weder neu gebaut noch verändert.** Auf einem frischen Android-35-KVM-
Emulator meldete die Installation `Success`; der reguläre Kaltstart der
`de.pholy.app.test/app.alextran.immich.MainActivity` meldete `Status: ok`.

Nach exakt 10 und 30 Sekunden waren die PID `3232` unverändert, die
PHOLY-Activity aktiv und das tatsächliche `mCurrentFocus` auf dieselbe
Activity gerichtet. Die beiden 720 × 1280-Pixel-Aufnahmen zeigen eine
vollständige PHOLY-Anmeldung mit Logo, Eingabefeldern, Anmeldebutton,
Passwortwiederherstellung und Versionsanzeige, ohne störenden Dialog.
Das Ergebnis-JSON enthält `passed: true` und Exitcode 0. Logcat bestätigt
den normalen Impeller-/OpenGLES-Renderer; es gab keinen Flutter-
Renderoverride. Der Crash-Puffer ist leer, und die gesicherten Logs
enthalten keine entsprechenden App-Absturz-/ANR-Marker.

Der vorherige Lauf `44284583432` bleibt als fehlgeschlagen dokumentiert:
Sein Parser suchte das Fokusfeld im reinen Fensterdump, der es auf dieser
Android-Version nicht enthielt. Schon dessen Activity-Dump hatte den
tatsächlichen PHOLY-Fokus aufgezeichnet. Der korrigierte Parser liest
diese reale Messung und lehnt fehlende oder fremde Fokuswerte weiterhin
ab. Die erfolgreiche Wiederholung verwendet unverändert dieselbe APK.

Dieser Nachweis umfasst ausschließlich den normalen anonymen App-Start.
Es wurden keine Kontoeingaben, App-Klicks, Recovery-Anfragen, Uploads oder
Community-Schreibaktionen vorgenommen. Ein gegebenenfalls automatisch
gesendeter tokenloser Logout wird durch den bestehenden serverseitigen
Authentifizierungs-Guard vor jeder Sitzungsänderung abgewiesen. Ein
separater HTTP-Erfolgsnachweis oder eine echte Kontoanmeldung wird aus
den Release-Screenshots nicht abgeleitet.

## 6. Noch nicht geprüfte reale Bedingungen

Eine beobachtete Darstellungsgrenze betrifft die untere Navigation bei
360 logischen Pixeln Breite: Die Beschriftung „Community“ wird gekürzt.
Das Symbol bleibt erreichbar; der Einstieg und die vollständige Überschrift
im Community-Bereich sind im Geräteflow nachgewiesen. Die gesicherten
Galerie- und Community-Aufnahmen zeigen diese Kürzung ohne Überlappung.

Die folgenden Punkte bleiben auch nach dem bestandenen synthetischen
Emulator-Smoke-Test gesondert offen:

- Anmeldung mit einem realen produktiven Konto, produktive Synchronisierung
  und Uploads an `pholy.de`. Dieser Prüfansatz verändert keine echten
  Benutzerdaten und versendet keine Testkommentare an reale Nutzer.
- Tatsächliche SMTP-Zustellung und Öffnen einer echten
  Passwort-Wiederherstellungs-E-Mail.
- Native Medien-Berechtigungsdialoge und Auswahl einzelner Medien auf
  physischer Android-Hardware.
- Hintergrund-Uploads unter Akkuoptimierung, Netzwechsel, Gerätesperre,
  Neustart oder nach Beendigung des App-Prozesses.
- Installation und Betrieb der ARM64-APK auf physischer Hardware,
  paralleler Gerätebetrieb mit Immich beziehungsweise einer späteren
  PHOLY-Produktionsapp sowie Updates einer signierten Test-APK.
- iOS-Kompilierung, Apple-Signierung, Share Extension, Widget und
  tatsächliches iPhone-/iPad-Verhalten.

Die iOS-Voraussetzungen sind konkret in der Buildanleitung beschrieben:
Mac und Xcode, CocoaPods, Apple-Team, Zertifikate und Provisioning Profiles,
die Kennungen `de.pholy.app`, `de.pholy.app.Widget` und
`de.pholy.app.ShareExtension` sowie `group.de.pholy.app.share`. Gemeinsamer
Flutter-Code und vorhandene Projektdateien allein belegen keine erfolgreiche
iOS-Kompilierung. Für iOS sind die numerischen Versionsargumente
`--build-name=3.4.1 --build-number=3040201` vorgesehen.
Die eigenen Xcode-Versionswerte von Widget und Share Extension sind für
Debug, Release und Profile ebenfalls auf `3.4.1` / `3040201` abgestimmt.
Das OpenStep-Projekt wurde vollständig syntaktisch eingelesen, die sechs
referenzierten Erweiterungskonfigurationen geprüft und alle drei
`Info.plist`-Dateien erfolgreich geparst. Diese Konfigurationsprüfung
ersetzt weiterhin keinen Build mit Xcode. Bei späteren Versionswechseln
müssen Hauptapp und Erweiterungen gemeinsam angepasst werden.

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
- Zusätzlich wurden die ELF-Programmheader aller **20 enthaltenen nativen
  Bibliotheken über beide APKs** geprüft: Sämtliche `PT_LOAD`-Segmente
  haben eine Ausrichtung von mindestens **16 KiB**. Beleg:
  `tooling/release-verification/elf-page-alignment.json`. Auch diese
  Prüfung ersetzt keinen Lauf auf einem Gerät mit 16-KiB-Speicherseiten.
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

### Auslieferungs- und Laufzeitnachweise

| Nachweis | Aktueller Stand |
| --- | --- |
| Downloadbereitstellung beider signierter APKs | Abgeschlossen; direkte Übergabedateien und privater GitHub-Prerelease mit exakt geprüften SHA-256-Werten |
| Android-Installation und App-Start | Exakte x64-APK vollständig bestanden; ARM64-Gerätetest weiterhin ausstehend |
| Erfolgreicher synthetischer Geräteflow mit Protokoll | Bestanden einschließlich Flutter-Testabschluss; Lauf 44300696699, 16 Prüfpunkte und 13 Aufnahmen |
| Updateprüfung mit derselben Testsignatur | Noch ausstehend |
| Entsprechender Quellcommit einschließlich Buildkorrekturen | Veröffentlicht; Commit- und Releasezuordnung in Abschnitt 1 |

Das Verifikationsskript führt keine Laufzeitprüfung durch. Die
Quellveröffentlichung wurde anschließend separat geprüft und im Manifest
mit `source_publication_checked: true` sowie den konkreten Commit-IDs
festgehalten. Das Paket `PHOLY-Android-Test-Pruefbelege.zip` enthält die
maßgeblichen unveränderten Protokolle, die nativen Bildschirmaufnahmen und
interne Prüfsummen. Frühere Fehlschläge und weiterhin offene reale
Bedingungen behalten ihren gesonderten Status.
