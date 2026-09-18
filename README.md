# Low-Poly Adventure (GameZombie) 🎮

Un gioco d'avventura 3D in terza e prima persona sviluppato con **Three.js**, **Vite** e modelli 3D creati e riggati in **Blender**.

## ✨ Caratteristiche

- **Modello 3D Riggato in Blender**: Personaggio con armature scheletrica, mesh gerarchica ed esportazione GLTF/GLB.
- **Motore di Animazione Scheletrico Dinamico**:
  - Camminata naturale con oscillazione cosce, piegamento ginocchia, flessione caviglie e oscillazione opposta delle braccia.
  - Corsa / Scatto (`Shift`) con falcata aumentata e inclinazione in avanti.
  - Salto / Posa aerea dinamica (`Spazio`).
  - Animazione Idle con respiro delicato e oscillazione baricentro.
- **Doppia Visuale**: Alterna tra 3ª persona (orbital camera) e 1ª persona (vista occhi) con il tasto `V`.
- **Controlli Completi per Smartphone & Tablet**:
  - Joystick analogico virtuale a 360°.
  - Swipe con tocco per rotazione libera della telecamera.
  - Pulsanti touch dedicati per Salto e Corsa.
- **Personalizzazione Mouse**: Toggle rapidi per Inversione Asse X (`X`) e Asse Y (`I`).
- **Mondo Procedurale Low-Poly**: Terreno deformato proceduralmente con alberi, rocce e gemme collezionabili con effetti sonori Web Audio.

---

## 🚀 Avvio Rapido (Windows)

Fai doppio clic su:
- **`start.bat`** (oppure `star.bat`)

Lo script verifica automaticamente Node.js, installa le dipendenze se mancanti e apre il browser all'indirizzo `http://localhost:3000/`.

---

## 💻 Installazione Manuale

```bash
# Installa le dipendenze
npm install

# Avvia il server di sviluppo (accessibile anche da smartphone nella stessa rete Wi-Fi)
npm run dev

# Compila per la produzione
npm run build
```

---

## 📱 Giocare da Smartphone

1. Connetti lo smartphone alla stessa rete Wi-Fi del computer.
2. Apri il browser dello smartphone all'indirizzo IP locale mostrato nel terminale Vite (es. `http://<IP-LOCALE>:3000/`).
3. Tocca lo schermo per giocare utilizzando il joystick e i pulsanti touch!

---

## 🕹️ Controlli

| Azione | PC (Tastiera e Mouse) | Smartphone / Touch |
|---|---|---|
| **Movimento** | `W, A, S, D` o Frecce | Joystick virtuale (Basso a sinistra) |
| **Salto** | `SPAZIO` | Pulsante `SALTA` |
| **Scatto / Corsa** | `SHIFT` (Tieni premuto) | Pulsante `CORSA` (Toggle) |
| **Cambia Visuale (1ª/3ª)** | `V` | Badge `Visuale` in alto a sinistra |
| **Inverti Asse X** | `X` | Badge `Mouse X` |
| **Inverti Asse Y** | `I` | Badge `Mouse Y` |
| **Ruota Visuale** | Movimento del Mouse | Swipe touch sulla metà destra |
