# Q60R – Positionswahrender Wiedergabetest (Version 6, experimentell)

**Status: Noch nicht am Fernseher erfolgreich abgenommen.** Die früheren Verfahren „intelligente Wiederherstellung“ (V5) und „Seite neu laden“ haben die praktischen Tests nicht bestanden. Dieses Experiment ist bewusst getrennt und standardmäßig ausgeschaltet.

## Ziel

Nach dem Wechsel zu Live-TV, Moonlight oder DeX muss das zuvor laufende YouTube-Video am selben Zeitpunkt wieder bedienbar sein. Automatisches Weiterspielen ist nicht erforderlich. Neue Videos müssen ebenfalls starten können. **Ein bloßer Seiten-Reload, ein schwarzes Bild oder ein Neustart bei 0:00 zählen nicht als Erfolg.**

## Vorbereitung

1. Die ursprüngliche TizenBrew-Installation sowie das alte TizenTube-Modul unbedingt beibehalten. Kein WGT installieren und den Entwickler-Host nicht ändern (normal: `127.0.0.1`).
2. Version 6 als separates GitHub-Modul hinzufügen und aus der **TizenBrew-Startansicht** starten, nicht durch Anklicken der Kachel in der Modulverwaltung (dort wird eine Löschung angeboten).
3. Unter **YouTube → Einstellungen → TizenTube-Einstellungen → Videoplayer-Einstellungen** genau diese drei experimentellen Schalter setzen:
   - „Videowiedergabe nach App-Wechsel wiederherstellen (bei Stillstand neu laden)“: **AUS**
   - „YouTube-Seite bei Rückkehr zur App neu laden“: **AUS**
   - „Videoposition beim App-Wechsel erhalten (Player-Reparatur, ohne Neuladen)“: **EIN**
4. Keine anderen Einstellungen verändern. Die neuen Einstellungen gelten nur im Rahmen dieses Experiments und können auf derselben YouTube-Origin mit dem Originalmodul geteilt werden.

## Ein einzelner Hardwaretest

1. Ein normales Video mindestens 20 Sekunden abspielen; **Titel und aktuelle Zeit** merken (beispielsweise 02:35).
2. Etwa 30 Sekunden zu Live-TV wechseln und anschließend zum Testmodul zurückkehren.
3. Falls rechts oben eine kleine Meldung „TizenTube Resume Lab: ...“ erscheint, **nur den Statuscode** notieren. Die Meldung verschwindet nach höchstens 18 Sekunden. Sie bestätigt den ausgeführten Softwarezweig, **nicht automatisch funktionierende Wiedergabe**.
4. Prüfen, ob Play funktioniert, die bisherige Zeit erhalten ist und anschließend ein anderes Video normal gestartet werden kann.

## Mögliche Statuscodes

- `AVPLAY_RESTORE_REQUESTED` / `AVPLAY_RESTORE_OK`: ein verfügbarer aktiver Samsung-AVPlay-Pfad wurde angesprochen; nur die Wiedergabe beweist Erfolg.
- `YT_SEEK_REQUESTED`: die bekannte YouTube-Videoposition wurde über einen verfügbaren Player-Seek erneut angefordert.
- `NO_SUPPORTED_PLAYER`: keine unterstützte Player-Schnittstelle wurde erkannt; **nicht blind wiederholen**.
- `YT_DIFFERENT_VIDEO`: der ausgewählte Titel oder das Player-Objekt hat sich geändert; aus Sicherheitsgründen kein altes Seek.
- `AVPLAY_*FAILED` / `YT_SEEK_FAILED`: entsprechende Operation gescheitert.

**Wenn keine Meldung erscheint**, ist unklar, ob der Dokument-Lebenszyklus die erwarteten Signale liefert. Auch dann bitte nicht beliebig weitere Tests wiederholen.

## Grenzen

Die Samsung-AVPlay-Schnittstelle ist nur nutzbar, falls youtube.com/tv tatsächlich Zugriff auf eine aktive AVPlay-Sitzung hat. Das ist für den konkreten Q60R **nicht bestätigt**. Ebenso sind die internen YouTube-Player-Methoden nicht als stabile öffentliche API garantiert. Die getestete Logik wurde bislang ausschließlich mit Simulationen und statischen Prüfungen abgenommen. Der Test sendet **keine Videotitel, Positionen oder Zugangsdaten** an einen Diagnoseserver.

Zurück zum Ausgangszustand: alle drei Experimente AUS; danach die originale TizenTube-Kachel aus der TizenBrew-Startansicht öffnen. Die ursprüngliche Anwendung nicht deinstallieren.

Quelle: [Samsung AVPlay API](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html); [Samsung Multimedia FAQ](https://developer.samsung.com/smarttv/develop/faq/multimedia.html).
