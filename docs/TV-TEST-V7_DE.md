# Samsung Q60R — Test V7: YouTube-Playersitzung erneuern

**Experimentell — nicht als funktionierende Reparatur bestätigt.** V5 und V6 sind auf dem echten Q60R nach App-Wechsel gescheitert. Die V6-Diagnose `YT_SEEK_REQUESTED` bestätigt zwar den Seek-Aufruf, aber die Wiedergabe bleibt eingefroren.

## Ziel

Nach einem Wechsel zu Live-TV soll dieselbe Video-ID an derselben Stelle wieder verfügbar sein. Ein weiteres Video muss danach ebenfalls starten. Ein bloßer Reload der Webseite, schwarzes Bild oder Neustart bei 0:00 sind keine Lösung.

## Einmaliger Test

1. Originale TizenBrew-App und alle bisherigen TizenTube-Module **behalten**.
2. In TizenBrew „GitHub-Modul hinzufügen“ die Kennung **ohne `gh/`** eintragen: `kleinanzeigelv-create/TizenTube-Resume-Lab@t7`.
3. **Aus der TizenBrew-Startansicht** die Kachel mit Version `1.15.2-resume-test.7` starten. In der Modulverwaltung dienen Kacheln der Löschung, nicht dem Start.
4. Unter `YouTube → Einstellungen → TizenTube-Einstellungen → Videoplayer-Einstellungen` drei alte Experimente ausschalten: „bei Stillstand neu laden“, „YouTube-Seite neu laden“ und „Videoposition beim App-Wechsel erhalten (Player-Reparatur)“. Nur das neue Experiment **„YouTube-Player-Sitzung nach App-Wechsel neu aufbauen (ohne Seiten-Neuladen)“ EIN**.
5. Video starten, Zeit merken, mindestens 20 Sekunden laufen lassen. 30 Sekunden Live-TV einschalten, zurück zu TizenTube und etwa 10 Sekunden warten.
6. Beobachten: Bild/Ton, Play-Bedienung, exakte Wiedergabezeit und Start eines anderen Videos. Foto oder Statuscode oben rechts melden.

## Lokale Diagnosecodes

- `YT_SESSION_RECREATE_REQUESTED`: Der Aufruf `loadVideoById(videoId, startSeconds)` wurde abgesetzt, **kein Erfolgsbeweis**.
- `YT_SESSION_STATE_RECEIVED`: Nach der Anforderung wurde ein Player-State-Ereignis registriert; dies beweist nicht funktionierendes Bild/Ton.
- `YT_SESSION_NO_STATE_EVENT`: Keine passende Zustandsmeldung nach 7 Sekunden.
- `YT_SESSION_API_UNAVAILABLE`: `loadVideoById` ist auf diesem YouTube-TV-Player nicht vorhanden; **nicht wiederholen**.
- `YT_SESSION_RECREATE_FAILED`: Aufruf oder Player-Interaktion hat eine Ausnahme ausgelöst.
- `YT_SESSION_CHANGED_VIDEO`: Video oder Player inzwischen gewechselt; aus Sicherheitsgründen keine Wiederherstellung der alten Position.

**Grenze:** Die offizielle YouTube-IFrame-API dokumentiert `loadVideoById` mit `startSeconds`, aber der proprietäre Player von `youtube.com/tv` muss diese Methode nicht anbieten. Eine komplette Dekoder-Ressourcenwiederherstellung kann native TizenBrew-Änderungen benötigen. Die Testvariante führt keinen Browser-Reload aus, ändert keine Samsung-Accounts und versendet keine privaten Diagnosedaten.

[Upstream: Videos don't play when leaving app #65](https://github.com/reisxd/TizenTube/issues/65) | [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)
