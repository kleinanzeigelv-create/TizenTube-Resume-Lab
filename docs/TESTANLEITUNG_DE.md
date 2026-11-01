# Testanleitung — Samsung Q60R (Tizen 5)

**Kurzfassung für den Test direkt am TV:** [TV-SCHNELLTEST_DE.md](TV-SCHNELLTEST_DE.md).

**Noch nicht auf dem TV erprobt.** Erst ausführen, wenn das öffentliche Repository mit dem festgelegten Git-Commit erreichbar ist. Die JavaScript-Datei wurde über jsDelivr bytegenau gegen den getesteten Build geprüft. Ein Git-Tag wird hierfür nicht benötigt. Dies ist ein Test einer modifizierten **TizenTube-Version**, kein
Ersatz der produktiv installierten TizenBrew-App.

1. **Original behalten:** Bestehendes TizenTube und Moonlight nicht löschen.
   Keine gespeicherten Google-Zugangsdaten verändern.
2. **Separates Modul hinzufügen:** In TizenBrew unter **Modulverwaltung → GitHub-Modul hinzufügen** nur
   `kleinanzeigelv-create/TizenTube-Resume-Lab@088c4912ab64` eingeben. **Kein `gh/` davor:** Das UI ergänzt es automatisch. Intern ist der vollständige Modul-Identifier
   `gh/kleinanzeigelv-create/TizenTube-Resume-Lab@088c4912ab64`. Der fixierte Commit lautet `088c4912ab642c187e23a6609c1bfc6cbf6cbe1d`. Die beiden Versionen
   nicht gleichzeitig automatisch starten. **Das Modul über die Startansicht wählen; Anklicken in der Modulverwaltung öffnet die Löschbestätigung.**
3. **Kontrollversuch:** Testversion starten, ein unkritisches Video abspielen,
   bei ausgeschalteten Wiederherstellungsoptionen zu Live-TV wechseln,
   anschließend zurückkehren. Bild, Ton, Navigation und nächstes Video prüfen.
4. **Adaptiv:** Unter TizenTube Einstellungen / Video Player ausschließlich
   `Resume playback recovery` aktivieren. Dasselbe Szenario dreimal
   wiederholen und prüfen, ob ein Freeze / schwarzer Player auftritt.
5. **Fallback:** Adaptive Wiederherstellung deaktivieren, stattdessen
   `Reload on resume` aktivieren und identisch testen. Ein Reload kann die
   aktuelle Wiedergabeposition oder laufende Sitzung beeinträchtigen.
6. **Rückbau:** Testmodul nicht mehr starten oder aus der Modulliste entfernen;
   das ursprüngliche TizenTube-Modul bleibt erhalten. Bei Fehlverhalten
   kein erneutes Installieren des nativen TV-Pakets ohne Rückbauplan.

**Nach jeder Variante nur berichten:** Bild/Ton? Video nach App-Wechsel
eingefroren? Neues Video schwarz? Neustart notwendig? Wurde das Video
automatisch neu geladen? Veränderte Wiedergabeposition? Ohne diese
Hardwarebeobachtung kann die Hauptreparatur nicht bestätigt werden.

Casting / DIAL und die separat entwickelten TizenBrew-Servicekorrekturen
sind in dieser vorläufigen Testversion bewusst nicht enthalten.
