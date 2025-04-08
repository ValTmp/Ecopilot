# EcoPilot - Nachhaltigkeitsplattform

EcoPilot ist eine KI-gestützte Nachhaltigkeitsplattform, die Benutzern hilft, umweltfreundliche Entscheidungen zu treffen. Die Plattform bietet personalisierte Tipps, Produktempfehlungen und CO2-Impact-Tracking.

## Features

- 🤖 KI-gestützte Nachhaltigkeitsberatung
- 📊 CO2-Impact-Berechnung und Tracking
- 🛍️ Nachhaltige Produktempfehlungen
- 📈 Detaillierte Analytics und Insights
- 🔒 Sichere Benutzerauthentifizierung
- 📱 Responsive Design

## Technischer Stack

- **Backend**: Node.js, Express
- **Datenbank**: Airtable
- **Cache**: Redis
- **KI**: OpenAI GPT-4
- **Analytics**: Google Analytics
- **Sicherheit**: JWT, Helmet, Rate Limiting

## Installation

1. Repository klonen:
```bash
git clone https://github.com/your-org/eco-pilot.git
cd eco-pilot
```

2. Abhängigkeiten installieren:
```bash
npm install
```

3. Umgebungsvariablen konfigurieren:
```bash
cp .env.example .env
```
Bearbeiten Sie die `.env` Datei mit Ihren API-Schlüsseln und Konfigurationen.

4. Server starten:
```bash
# Entwicklung
npm run dev

# Produktion
npm start
```

## API-Dokumentation

### Authentifizierung

#### POST /api/auth/register
Registriert einen neuen Benutzer.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe"
}
```

#### POST /api/auth/login
Authentifiziert einen Benutzer.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

### CO2-Berechnung

#### POST /api/co2/calculate
Berechnet den CO2-Impact einer Aktivität.

**Request Body:**
```json
{
  "activity": "car_travel",
  "value": 100,
  "unit": "km",
  "date": "2024-03-20T10:00:00Z"
}
```

#### POST /api/co2/batch
Berechnet den CO2-Impact mehrerer Aktivitäten.

**Request Body:**
```json
{
  "activities": [
    {
      "activity": "car_travel",
      "value": 100,
      "unit": "km"
    },
    {
      "activity": "electricity",
      "value": 500,
      "unit": "kwh"
    }
  ]
}
```

### Produkte

#### POST /api/products
Erstellt ein neues Produkt (nur Admin).

**Request Body:**
```json
{
  "name": "Eco-Friendly Water Bottle",
  "description": "Sustainable water bottle made from recycled materials",
  "price": 29.99,
  "category": "kitchen",
  "ecoScore": 95,
  "co2Savings": 2.5,
  "affiliateLink": "https://example.com/product"
}
```

### Analytics

#### POST /api/analytics/track
Trackt ein Analytics-Event.

**Request Body:**
```json
{
  "event": "product_view",
  "properties": {
    "productId": "123",
    "category": "kitchen"
  },
  "userId": "user123"
}
```

## Sicherheit

- JWT-basierte Authentifizierung
- Rate Limiting für API-Endpunkte
- Helmet für Security-Headers
- Input-Validierung mit Joi
- XSS-Schutz
- CORS-Konfiguration

## Entwicklung

### Tests ausführen
```bash
npm test
```

### Code formatieren
```bash
npm run format
```

### Linting
```bash
npm run lint
```

## Deployment

1. Umgebungsvariablen für Produktion konfigurieren
2. Redis-Server einrichten
3. SSL-Zertifikat konfigurieren
4. PM2 oder ähnlichen Process Manager verwenden
5. Nginx als Reverse Proxy einrichten

## Lizenz

MIT

## Support

Bei Fragen oder Problemen erstellen Sie bitte ein Issue im GitHub Repository. 