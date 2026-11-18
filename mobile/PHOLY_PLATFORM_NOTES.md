# PHOLY: native Plattformkennungen und Signierung

Diese Hinweise ergänzen die Android-Testbuild-Anleitung. Die bestehenden Upload-,
Synchronisations- und Hintergrunddienste bleiben Bestandteil derselben Flutter-App.
Es wurde keine Store-Veröffentlichung eingerichtet oder ausgeführt.

## Android

| Variante | Application ID |
| --- | --- |
| Release | `de.pholy.app` |
| Debug | `de.pholy.app.debug` |
| Release mit `PHOLY_ANDROID_TEST_BUILD=true` | `de.pholy.app.test` |

Der Kotlin-Namespace `app.alextran.immich` bleibt erhalten. Er bezeichnet die
vorhandenen Klassen, Ressourcen und JNI-Symbole, nicht die installierte Android-App.
Auch Pigeon-Kanäle, native WorkManager-Namen und die Widget-Klassennamen bleiben
unverändert. WorkManager-Daten, Einstellungen und Berechtigungen sind über den
App-Kontext der jeweiligen PHOLY-Installation zugeordnet. Berechtigungsdialoge
verwenden `context.packageName` beziehungsweise `activity.packageName`.

Lokale APK-Builds verwenden Flutter/Gradle und benötigen keine Play-Zugangsdaten.
Die übernommenen Fastlane-Store-Lanes sind nicht Teil der Testauslieferung. Sie
zielen jetzt ausschließlich auf `de.pholy.app` und brechen ohne
`PHOLY_GOOGLE_PLAY_JSON_KEY` ab. Diese Variable muss bei einer später ausdrücklich
beauftragten Store-Auslieferung auf eine externe Servicekonto-Datei für PHOLY
verweisen. Test- und PR-Paketkennungen werden in diesen Lanes abgelehnt. Für
Store-Builds werden außerdem der eigene Release-Signierschlüssel und die passenden
Gradle-Signierangaben benötigt; Schlüssel bleiben außerhalb von Git.

## iOS

| Konfiguration | App | App Group |
| --- | --- | --- |
| Release | `de.pholy.app` | `group.de.pholy.app.share` |
| Debug | `de.pholy.app.debug` | `group.de.pholy.app.share.debug` |
| Profile | `de.pholy.app.profile` | `group.de.pholy.app.share.profile` |

Die Erweiterungen ergänzen die jeweilige App-Kennung um `.ShareExtension` und
`.Widget`. Haupt-App, Share-Erweiterung und Widget verwenden pro Konfiguration
dieselbe App Group aus `AppGroupId`. Das Share-Schema
`ShareMedia-$(PRODUCT_BUNDLE_IDENTIFIER)` wird vom bestehenden Share-Plugin aus der
Host-App-Kennung abgeleitet und bleibt konsistent mit diesen Kennungen.

Die Hintergrundaufgaben lesen ihre Kennungen aus
`BGTaskSchedulerPermittedIdentifiers`; die dortigen Werte verwenden die aktuelle
`PRODUCT_BUNDLE_IDENTIFIER` mit `.background.refreshUpload` und
`.background.processingUpload`. Die alten Immich-Kennungen in den
Debugger-Beispielkommentaren sind keine Laufzeitkonfiguration. Die Widget-Kinds
`com.immich.widget.random` und `com.immich.widget.memory` stimmen mit den
Flutter-Aufrufen überein und sind keine App- oder App-Group-Kennungen.

Für einen signierten iOS-Gerätebuild fehlen weiterhin die konkrete Apple-Developer-
Teamzuordnung, Zertifikate und Provisioning-Profile für App und Erweiterungen sowie
die Registrierung der jeweiligen App Groups. Diese Angaben gehören in die
ignorierte `ios/Signing.local.xcconfig` und in den lokalen Schlüsselbund. Das
Projekt muss auf macOS mit Xcode und den Projektabhängigkeiten gebaut werden.
Upload und Hintergrundverarbeitung müssen anschließend auf einem echten Gerät
geprüft werden; eine Quellcodeprüfung ersetzt das nicht.

Die vorhandenen Fastlane-Lanes enthalten keine fremden Apple-/FUTO-Konten mehr.
Sie verlangen vor den jeweiligen Aktionen explizite PHOLY-Angaben:

| Variable | Verwendung |
| --- | --- |
| `PHOLY_APPLE_TEAM_ID` | Apple Developer Team für alle Fastlane-Builds |
| `PHOLY_IOS_CODE_SIGN_IDENTITY` | Vorhandene Signieridentität für die gewählte Teamzuordnung |
| `APP_STORE_CONNECT_API_KEY_ID` | API-Key-ID für die API-basierten bestehenden Lanes |
| `APP_STORE_CONNECT_API_KEY_ISSUER_ID` | Zugehörige App-Store-Connect-Issuer-ID |
| `PHOLY_APP_STORE_CONNECT_API_KEY_PATH` | Externe `.p8`-Datei, kein Repository-Pfad |
| `PHOLY_APP_STORE_APP_ID` | Numerische App-Store-Connect-App-ID für `de.pholy.app`, nur bei Upload-Lanes |
| `PHOLY_APP_STORE_PROFILE_APP_ID` | Separate numerische App-ID für `de.pholy.app.profile`, nur bei dessen Upload-Lane |
| `PHOLY_APPLE_ID` | Eigenes Apple-Konto, nur bei der übernommenen manuellen Release-Lane |
| `PHOLY_APP_STORE_CONNECT_TEAM_ID` | Eigenes App-Store-Connect-Team, nur bei dieser manuellen Lane |

Es wurden keine Zugangsdaten eingetragen, Profile angefordert oder Fastlane-Lanes
ausgeführt. Der bestehende Build ohne Upload verlangt keine numerische
App-Store-Connect-App-ID.

## URL-Routen, OAuth und Passkeys

App- und Widget-Verweise verwenden `pholy://`. Die nativen Domain-Einträge zeigen
auf `pholy.de`. Verifizierte Android App Links beziehungsweise iOS Universal Links
setzen zusätzlich passende serverseitige Domain-Zuordnungen für die konkreten
Signieridentitäten voraus. Diese werden durch eine Manifest- oder Entitlement-
Änderung allein nicht bereitgestellt.

Der OAuth-Callback bleibt bewusst `app.immich:///oauth-callback`: Der bestehende
Server behandelt dieses Schema sowohl beim mobilen Redirect als auch beim
Redirect-Override ausdrücklich. Eine alleinige Umbenennung in der App würde diese
Kompatibilität brechen. OAuth ist im derzeitigen PHOLY-Serverstand deaktiviert.
Falls OAuth später aktiviert wird, können PHOLY und eine parallel installierte
Immich-App um dasselbe Callback-Schema konkurrieren. Vor einer solchen Aktivierung
müssen App, Server und Identity-Provider gemeinsam ein PHOLY-eigenes Schema
unterstützen und der Rücksprung praktisch geprüft werden. Die normale
PHOLY-Anmeldung mit E-Mail und Passwort ist davon unabhängig.

Android-Passkeys bleiben bis zur passenden Domain-/Signaturzuordnung deaktiviert.
Die vorhandenen API-Cookie-Namen, etwa `immich_access_token`, und internen
Transportkennungen bleiben für die Kompatibilität mit dem bestehenden Backend
unverändert.
