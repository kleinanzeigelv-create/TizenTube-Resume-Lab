# Samsung Q60R (Tizen 5): TizenTube-Schnelltest

**Experimentell – noch kein bestätigter Fix am Fernseher.** Diese Anleitung testet ausschließlich ein zusätzliches TizenTube-Modul. Die installierte TizenBrew-App, das originale TizenTube, Moonlight und Kontodaten bleiben unangetastet. Kein SDK, Laptop, Terminal, WGT oder Samsung-Zertifikat nötig.

## Vorbereitungen (einmalig)

1. **Nur falls der Entwickler-Host derzeit nicht 127.0.0.1 ist:** Samsung **Apps** öffnen, im Apps-Bereich auf der Fernbedienung **12345** eingeben, **Developer Mode EIN** belassen und **Host-PC-IP auf `127.0.0.1`** setzen. Bestätigen. Den TV anschließend mit lang gedrückter Power-Taste bis zum Samsung-Neustartlogo neu starten. Dieser Host ist die bisher funktionierende Einstellung für TizenBrew; die Änderung beendet erwartungsgemäß die SDB-Verbindung zum Home-Server.
2. TizenBrew öffnen, **Modulverwaltung / Module Manager → GitHub-Modul hinzufügen** auswählen. **Nur diesen Text** in das Eingabefeld eingeben:

   `kleinanzeigelv-create/TizenTube-Resume-Lab@088c4912ab64`

   **Nicht `gh/` davor schreiben:** Der „GitHub-Modul hinzufügen“-Dialog ergänzt diesen Präfix bereits automatisch. Beim Verlassen des Eingabefelds speichert die bekannte TizenBrew-UI den Eintrag. In der Modulliste sollte **TizenTube Resume Lab (experimental)** erscheinen.
3. In die **Start-/Modulauswahl** von TizenBrew wechseln und dort **TizenTube Resume Lab (experimental)** starten. **Nicht** in der *Modulverwaltung* auf die Kachel des originalen TizenTube drücken: Dort öffnet ein Klick die Löschbestätigung, nicht die Wiedergabe. Wenn stattdessen immer automatisch das Original startet oder das Testmodul nicht erscheint, bitte an dieser Stelle stoppen und das Verhalten melden; nichts deinstallieren oder Autostart-Einstellungen auf Verdacht ändern.

## Erster Funktionstest (wenige Klicks)

4. Im TizenTube-Einstellungsmenü unter **Videoplayer** zuerst sicherstellen:
   - **„Experimentell: Videowiedergabe nach App-Wechsel wiederherstellen (bei Stillstand neu laden)“ = EIN** (adaptive Wiederherstellung)
   - **„Experimentell: YouTube-Seite bei Rückkehr zur App neu laden“ = AUS** (alternativer Fallback)
5. Danach ein beliebiges unkritisches Video starten. **Während es tatsächlich läuft**, für etwa 20–30 Sekunden zu **Live-TV** wechseln und anschließend über Home zurück zum Testmodul. Prüfen: läuft Bild und Ton? Ist das Video eingefroren? Läuft ein **neu ausgewähltes Video**? Musste TizenBrew vollständig neu gestartet werden?
6. Das Resultat mitteilen. Nur wenn der erste Versuch grundsätzlich funktioniert, denselben Wechsel mit **Moonlight** und **DeX** und anschließend mehrmals wiederholen. **Nicht** gleichzeitig beide experimentellen Schalter einschalten.

## Falls adaptiv scheitert

Nur im **Testmodul** den adaptiven Schalter **AUS**, alternativ **„YouTube-Seite bei Rückkehr zur App neu laden“ = EIN** setzen. Genau einen Live-TV-Wechsel wiederholen. Ein Reload kann die Wiedergabeposition verlieren und ist ausdrücklich nur ein Versuch, kein garantierter nativer Decoder-Neustart.

## Rückkehr zum bisherigen Zustand

- Beide experimentellen Schalter **AUS** setzen (beide Versionen können denselben YouTube-Einstellungsspeicher verwenden).
- Testmodul beenden, in TizenBrew wieder **das originale TizenTube** starten. Das Testmodul darf zunächst installiert bleiben; es wird nicht automatisch gestartet, sofern es nicht ausdrücklich zum Autostart ausgewählt wurde.
- Den Entwickler-Host **auf `127.0.0.1` belassen**; das ist die ursprüngliche Betriebs-Konfiguration. Das Testmodul bei Bedarf ausschließlich über die TizenBrew-Modulverwaltung entfernen, **nicht** die native TizenBrew-App deinstallieren.

**Bitte nur melden:** Funktionierten Bild und Ton nach Rückkehr? Einfrieren/schwarzer Bildschirm? Neues Video spielbar? Automatischer Reload? Vollständiger Neustart nötig? Keine Kontodaten, Geräte-IDs oder privaten YouTube-Links senden.

Der unveränderte Originalzustand wurde bereits vor dem Experiment getestet; dieser fehlgeschlagene Baseline-Test muss nicht nochmals durchgeführt werden. Die reine Aufnahme des Testmoduls löst das ursprüngliche Problem nicht nachweislich.

### Technische Identifikation

- Vollständiger TizenBrew-Identifier (intern): `gh/kleinanzeigelv-create/TizenTube-Resume-Lab@088c4912ab64`
- Testversion: `1.15.2-resume-test.5`, feste Git-Revision `088c4912ab642c187e23a6609c1bfc6cbf6cbe1d`
- Geprüftes JavaScript-Bundle: SHA-256 `6e09f4f909dcb1ce0c80c65a0698c45aba6799dd0a13d9c86cd7eeb293626dc7`
- Diese Testvariante enthält **keinen DIAL-/Casting-Dienst** und **keine** separat entwickelten TizenBrew-Nativpatches.
