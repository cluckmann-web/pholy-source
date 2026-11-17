# PHOLY

PHOLY ist eine eigene Foto- und Videoanwendung auf Basis von [Immich](https://github.com/immich-app/immich).
Die technische Basis dieser Fassung ist **Immich v3.4.1**, festgelegt auf
`22b95194c80a2f2e6201093916b6c8c3d6d271dd`.

PHOLY verwendet die eigene Oberfläche, Wortmarke, Farben, Browser-Icons und
eine öffentliche Quellcode-Seite. Die Kernfunktionen und die kompatible API
stammen aus Immich. Die Herkunft und die AGPL-Lizenz bleiben erhalten.

## Betrieb

Die Anwendung wird nativ unter Ubuntu 24.04 und systemd betrieben, ohne Docker.
Ein Plesk-Reverse-Proxy stellt sie unter [pholy.de](https://pholy.de/) bereit.

- Originaldateien und abgeleitete Medien: Hetzner-CIFS unter `Cloud-Fotos/PHOLY`.
- Datenbank und Warteschlange: eigene lokale PostgreSQL-/Redis-Dienste.
- Bildanalyse: eigener lokaler Python-Dienst.
- Zugangsdaten, Datenbanken und Nutzerdateien liegen außerhalb dieses Repositories.
- Automatische Datenbank-Backups sind deaktiviert.

Die vollständige Bau- und Betriebsanleitung steht in
[deployment/pholy/README.md](deployment/pholy/README.md). Der Build verwendet
die festgelegten Upstream-Versionen und erstellt einen abgeschlossenen
Release-Ordner mit dem dazugehörigen Quellcodearchiv.

## Entwicklung

Der produktive Entwicklungszweig ist `main`. Upstream-Aktualisierungen werden
bewusst übernommen und vor dem Einsatz geprüft. Technische Paketnamen,
API-Endpunkte und die Immich-Version bleiben für die Kompatibilität erhalten.

PHOLY-Anpassungen liegen hauptsächlich unter `web/` und `deployment/pholy/`.
Die ursprünglichen GitHub-Workflows sind zur Referenz unter
`.github/upstream-workflows/` abgelegt und werden nicht automatisch ausgeführt.

Die frühere PHOLY-Anwendung auf Nextcloud-/Lychee-Basis wird durch diese
Anwendung ersetzt. Dieses Repository enthält keine zweite Produktanwendung.

## Quellcode und Lizenz

Der zur laufenden Fassung gehörende vollständige Quellcode wird über
[pholy.de/source/](https://pholy.de/source/) angeboten. Das Archiv enthält
die PHOLY-Anpassungen, die ursprünglichen Quellen, Lizenz, Lockfiles und
Bau-/Installationsanleitungen.

PHOLY wird unter der **GNU Affero General Public License, Version 3** verteilt.
Siehe [LICENSE](LICENSE) und
[deployment/pholy/NOTICE.pholy](deployment/pholy/NOTICE.pholy).
Immich und PHOLY sind unterschiedliche Projekte; PHOLY wird nicht vom
Immich-Team betrieben. Die ursprüngliche Projektbeschreibung steht in
[UPSTREAM-README.md](UPSTREAM-README.md).
