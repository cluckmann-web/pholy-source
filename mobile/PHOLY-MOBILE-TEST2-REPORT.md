# PHOLY Android Test 2 – Prüf- und Auslieferungsbericht

**Test 2 mit Updatefunktion und Impressum ist als signierte Android-APK veröffentlicht. Der abschließende Android-Lauf hat beide Upgradewege bestanden: Original-Test-1 → offizielle Test-2 sowie Download und Installation über den neuen Updater. In beiden Fällen blieben UID, ursprünglicher Installationszeitpunkt und synthetische private Testdaten erhalten; installiert ist exakt die offizielle APK.**

Stand: 18. November 2026. Finaler nativer Lauf `44338705737/1`: erfolgreich. Die finalen Screenshots wurden einzeln geprüft: vollständiges Impressum mit Kontakt, aktivierte Installationsquelle, Updatebestätigung, „App installed.“ mit Done/Open, gestartete PHOLY-App mit mobile.2 und abschließend „PHOLY is up to date“. Der Appstart-Screenshot zeigt einen Verbindungs-Ladezustand, keine authentifizierte Anmeldung.

## 1. Funktionen und Installation

**App-Updates** und **Impressum** sind auf Anmeldung und Einstellungen erreichbar, mit deutscher und englischer Oberfläche. Das Impressum enthält die veröffentlichten deutschen Angaben zu Weblygo, Inhaber Carsten Luckmann, Anschrift und Kontakt; es ist ohne Anmeldung und Netz verfügbar.

Updates werden manuell oder abschaltbar automatisch höchstens einmal in 24 Stunden geprüft. Der Nutzer startet den abbrechbaren Download und bestätigt Androids Installation. Feed, Paket, Architektur, SDK, Version, Größe und SHA-256 werden geprüft; nativ sind derselbe aktuelle Signierer und eine höhere Buildnummer erforderlich. Installationsberechtigung und begrenzter FileProvider gelten nur für die Testausgabe.

Feed und APK-Downloads benötigen weder PHOLY-Kontodaten noch einen GitHub-Token. Konten, Fotos, Berechtigungen und einladungsgebundene Registrierung bleiben bei der bestehenden Plattform. Details: [PHOLY-UPDATES.md](https://github.com/cluckmann-web/pholy-source/blob/b396df9d8464546bf78ddbeedc802874a21979db/mobile/PHOLY-UPDATES.md).

**Test 1 einmal manuell aktualisieren:** Passende APK herunterladen und über die vorhandene App installieren. **Nicht vorher deinstallieren.** Test 1 hat noch keinen Updater. ARM64 ist für entsprechende Android-Geräte, x64 insbesondere für x86-64-Emulatoren bestimmt.

[Release und Downloads](https://github.com/cluckmann-web/pholy-source/releases/tag/pholy-mobile-3.4.1-test.2) · [Installationsanleitung](https://github.com/cluckmann-web/pholy-source/releases/download/pholy-mobile-3.4.1-test.2/PHOLY-Android-Installation.txt)

## 2. Version, Quellen und Dateien

| Merkmal | Wert |
| --- | --- |
| Appversion / Plattformbasis | `3.4.1-pholy-mobile.2` / `3.4.1-pholy.16` |
| Testpaket / Anzeigename | `de.pholy.app.test` / PHOLY Test |
| Mindest-SDK / Target-SDK | API 26 / API 36 |
| Flutter-/iOS-Basisbuildnummer | `3040202` |
| ARM64 / x64 versionCode | `3042202` / `3044202` |
| Öffentliche APK-Buildquelle | `b396df9d8464546bf78ddbeedc802874a21979db` |
| Release-Tag / Release-ID | `pholy-mobile-3.4.1-test.2` / `450105778` |
| Öffentlicher Feed-Commit | `026a62903a54e5bb92ed2ee71e5ea7cb37f299e4` |

APK-Quelle: [Commit b396df9](https://github.com/cluckmann-web/pholy-source/tree/b396df9d8464546bf78ddbeedc802874a21979db). Der spätere Feed-Commit ändert nur Downloadmetadaten.

| Download | Bytes | SHA-256 |
| --- | ---: | --- |
| [ARM64-APK](https://github.com/cluckmann-web/pholy-source/releases/download/pholy-mobile-3.4.1-test.2/PHOLY-Android-Test-3.4.1-2-arm64.apk) | 87.140.367 | `35bf6f9f79d41e652cf1dceadf36d659026426f3d4b5d83c2ad63419e36d4d77` |
| [x64-APK](https://github.com/cluckmann-web/pholy-source/releases/download/pholy-mobile-3.4.1-test.2/PHOLY-Android-Test-3.4.1-2-x64.apk) | 90.220.393 | `add6880100f35e62fd70361ccb6a1dc49833657d9fdfe67e4db71a626840e7c2` |

Anonym heruntergeladene und nach dem Neustart erneut bezogene APKs haben dieselben Größen und vollständigen Hashes wie die geprüften Originale. Die CI prüfte zusätzlich die offizielle x64-Datei.

Fester Feed: [android-test.json](https://raw.githubusercontent.com/cluckmann-web/pholy-source/main/mobile/updates/android-test.json). Er enthält die tatsächlichen ABI-Buildnummern, Größen, Hashes, Downloadadressen und den APK-Quellcommit. Der geprüfte anonyme Abruf ergab 1.497 Bytes; SHA-256 `e06275eb6065f136b1218f99f9e6b033ebd29589f9ab9bf7225317796330a3d4`. Veröffentlichungszeit im Feed: `2026-11-18T14:45:32Z`.

## 3. Analyse, Tests, Build und statische Prüfung

| Prüfung | Ergebnis und Umfang |
| --- | --- |
| `flutter analyze --no-pub` | Bestanden: „No issues found!“ |
| `update_controller_test.dart` | 28 bestanden: Zustände, Versionen, Tagesbegrenzung, Opt-out, Abbruch und Berechtigungen |
| `update_service_test.dart` | 56 bestanden: Feed/URLs, Downloadgrenzen, Hash, Weiterleitungen und Cachepflege |
| `update_page_test.dart` | 17 bestanden: Zustände/Aktionen, auch 320 px bei 200 % deutscher Schrift in beiden Designs |
| `imprint_page_test.dart` | 8 bestanden: gebündelte Inhalte, Links, fehlende externe Apps und Ansichten bei 200 % Schrift |
| Flutter-Tests gesamt | **109 bestanden**, „00:06 +109: All tests passed!“ |
| Native JVM-Regeltests | **16 bestanden**, „OK (16 tests)“; keine Android-Instrumentierung |
| Native Kotlin-Typprüfung | Gegen Android 36, Flutter, AndroidX und Coroutines bestanden; `BuildConfig` als Stub |
| Signierter Build | `bash mobile/scripts/build-pholy-android.sh`, 14:29:52–14:38:43 UTC, Exitcode 0; beide APKs erzeugt |

Die anschließende statische Prüfung beider APKs bestand: Paket, Version, SDK, ABI, Anzeigename, nicht debuggbarer AOT-Release, APK-v2-Signatur sowie ZIP-/native Ausrichtung und ELF-Load-Segmente. In `libapp.so` war `https://pholy.de` vorhanden und das Fixtureliteral `127.0.0.1:17415` nicht vorhanden.

Der nicht exportierte Provider `de.pholy.app.test.pholy-updates` verweist exakt auf `xml/pholy_update_paths` (`0x7f150006`, APK-Pfad `res/ni.xml`) mit ausschließlich `pholy-updates/verified/`. Die Korrektur des externen Verifiers für AAPTs verkürzte Dateinamen änderte keine APK.

Beide APKs tragen denselben Signierer wie Test 1. Zertifikat-SHA-256:

```text
508817d5ae05654119171066f8f23777093d15fc2cd8d1facef8735c9092f769
```

Die CI bestätigt Signierer, APK-v2-Gültigkeit und 16-KiB-ZIP-Ausrichtung erneut für Test 1, offizielle Test 2 und Installer-Fixture.

## 4. Native Szenarien – beide bestanden

[Lauf 44338705737/1](https://github.com/cluckmann-web/pholy/actions/runs/44338705737/attempts/1), Job `134922385966`, CI-Commit `50b5c645e96ae9a4937ba4cf62c73d9b58f4f8a7`: **`passed: true`**, `both-upgrade-scenarios-passed`, `error: null`; abgeschlossen **15:51:45.459239 UTC**. GitHub: `completed/success`, aktualisiert 15:51:53 UTC.

Originalartefakt: `pholy-test2-upgrade-44338705737-1`, ID `14442244182`, **6.491.549 Bytes**, geprüfter SHA-256 `0198a764ebcbe254437d44de1a5d0ad8e0d788c09659200cd5bb7ea3401c08f1`. Keine APKs wurden gebaut oder neu signiert.

### A: Original-Test-1 → offizielle Test-2

Auf einem frischen Android-35-x64-Emulator wurde Original-Test-1 mit `adb install -r` auf die unveränderte offizielle Test-2 aktualisiert: der für Test 1 erforderliche manuelle Übergang.

**Legal notice** wurde über den Loginlink geöffnet: **Weblygo, Inhaber: Carsten Luckmann, Thomästr. 27, 59494 Soest, Deutschland** sind sichtbar. Rückkehr zur Anmeldung und Feedprüfung bestanden. Screenshot: `native/test1-to-test2/ui/0005-legal-notice-content-0.png`. Keine externen Links geöffnet; Netz eingeschaltet, Offlineanzeige durch Widgettests geprüft.

### B: Neuer Updater → offizielle Test-2

Die private Fixture enthält offiziellen Test-2-Code und Signierer mit abgesenktem `versionCode 3044201`; **2.427 übrige ZIP-Payloads sind identisch**. Nur der Manifestversionswert wurde geändert. Kein Nutzerdownload.

Die App lud die öffentliche APK herunter und öffnete Quellenfreigabe und Systeminstaller. **Update**, die Erfolgsmeldung **„App installed.“** und anschließend **Open** sind in `installer-confirmation.json`/`installer-completion.json` belegt. Das Upgrade nach Installation der Fixture erfolgte **ohne `adb install`**.

### Exakte APK und Datenerhalt nach beiden Upgrades

Beide Fälle wechselten `3044201 → 3044202`; die vom Gerät gelesene APK entspricht exakt dem offiziellen x64-Hash aus Abschnitt 2. Vorher-/Nachherwerte:

| Merkmal | Szenario A | Szenario B |
| --- | --- | --- |
| UID vorher/nachher | `10209` / `10209` | `10209` / `10209` |
| Unveränderte firstInstallTime | `2026-11-18 15:45:23` | `2026-11-18 15:47:55` |
| Privater Marker | Hash identisch; Eigentümer `10209`, Modus `600` erhalten | Hash identisch; Eigentümer `10209`, Modus `600` erhalten |

Markerhashes: `before-upgrade.json`/`after-upgrade.json`. Beide Apps zeigten anschließend **„Installed: 3.4.1-pholy-mobile.2“** und **„PHOLY is up to date“** (`0010-up-to-date.xml` in A, `0041-up-to-date.xml` in B). Installation und Datenerhalt sind tatsächlich nachgewiesen.

### Kurze CI-Fehlhistorie

| Früherer Lauf / Versuch | Beobachteter Abbruch; nachfolgende Korrektur |
| --- | --- |
| `44328097074/1` | SDK-Systemimage ließ sich nicht entpacken; frischer Wiederholungslauf |
| `44328097074/2` | Zweiter AVD ohne genügend Platz; beendeten ersten Test-AVD gezielt entfernen |
| `44332558263/1` | Zweiter AVD meldete verweigerten KVM-Zugriff; Job-UID-Freigabe und Beschleunigungsprüfung vor jedem AVD |
| `44334386496/1` | Erstinstallation brach ab, ADB danach offline; kein konkreter PHOLY-Paketfehler; identischer frischer Wiederholungslauf |
| `44334386496/2` | Installation erreicht, aber Erfolgdialog mit Done/Open noch offen; Runner wartet auf „App installed.“ und wählt Open |

Nur CI-Umgebung und Ablauf wurden angepasst; App und APKs blieben unverändert. Der Schlusslauf bestand beide Fälle.

## 5. Provenienz, Belege und Aussagegrenzen

**Die ursprünglichen lokalen Rohlogs von Analyse, Tests, Build und statischer APK-Prüfung sowie das ursprüngliche Prüfmanifest gingen beim Neustart des Arbeitsbereichs verloren.** Abschnitt 3 beschreibt vorher tatsächlich ausgeführte und beobachtete Prüfungen. `records/observed-local-validation.json` fasst diese nachträglich transparent zusammen; es ist weder rekonstruierter Rohlog noch behaupteter Wiederholungslauf. Die offiziellen APKs wurden unverändert aus dem Release wiederhergestellt. Die native CI liefert eigene erhaltene Originalbelege.

Archivstruktur von **PHOLY-Android-Test-Pruefbelege.zip** mit finalem CI-Nachweis und visuell geprüften Screenshots:

| Archivpfad | Inhalt |
| --- | --- |
| `REPORT.md`, `README.md` | Bericht und Prüfumfang |
| `PHOLY-Android-Test-Manifest.json`, `SHA256SUMS.txt` | Neuer Finalnachweis mit eigener Provenienz und Archivdatei-Hashes; keine Rekonstruktion des verlorenen Manifests |
| `records/observed-local-validation.json` | Zusammenfassung der früher beobachteten Prüfungen |
| `records/recovered-public-assets.json`, `records/public-feed*.json` | Öffentliche APK-/Feed-Daten und Abrufnachweise |
| `records/production-health.json`, `records/ci-metadata.json` | Statusauszug und CI-Metadaten |
| `native/run-result.json`, `native/verified-apks.json` | Nativer Gesamtstatus und APK-Eingangsprüfung |
| `native/test1-to-test2/`, `native/updater-ui/` | Szenarioresultate, Vorher-/Nachherwerte, Impressum, AVD-Bereinigung beziehungsweise Installerbestätigung und Abschlussdialog |
| `native/*/ui/` | Originalhierarchien und ausgewählte geprüfte Screenshots |

Ohne PHOLY-Zugangsdaten: Der Datenerhaltstest betrifft einen synthetischen Marker, keine echte Sitzung oder Fotos. Anmeldung, Upload, Synchronisation, Fotoansicht, Kommentare und Hintergrundsicherung wurden in Test 2 nicht vollständig erneut geprüft; die bisherigen Ergebnisse bleiben in `mobile/PHOLY-MOBILE-TESTREPORT.md` erhalten.

Android 35/x64 belegt keine physische ARM64-Ausführung oder tatsächlichen Betrieb mit 16-KiB-Speicherseiten. Statische Ausrichtung und Serverliterale ersetzen keine Gerätetests oder Netzwerkmitschnitte. Eine lesende Produktionsprüfung um 15:08:40 UTC bestätigte einen aktiven Dienst, `pong` und HTTP 200 für die geprüften Web-/API-Routen, ohne Bereitstellung oder Dienstneustart. Echte Nutzerdaten wurden nicht verändert; Testnachrichten an reale Nutzer wurden nicht gesendet.

## 6. iOS und Veröffentlichung

Für iOS liegen Impressum und Updateansicht im gemeinsamen Flutter-Code; es gibt dort keinen APK-Installer. IPA und iPhone-Gerätetest fehlen. Erforderlich: Mac/Xcode/CocoaPods, Apple-Team, Zertifikate und Provisioning Profiles; siehe [Buildhinweise](https://github.com/cluckmann-web/pholy-source/blob/b396df9d8464546bf78ddbeedc802874a21979db/mobile/PHOLY-MOBILE.md).

Android-Testpakete ab API 26; keine 32-Bit-APK oder Store-Veröffentlichung. Quellen und Lizenzhinweise bleiben erhalten. Der GitHub-Feed erfordert keine Änderung am produktiven Webserver.
