# Paper Jam: Son Baskı — HTML Dikey Kesit

GDD'deki temel oyun döngüsünü tarayıcıda oynanabilir hale getiren, bağımlılıksız HTML5 Canvas prototipi.

## Çalıştırma

Dosyaları doğrudan açmak yerine yerel bir sunucu kullanın:

```bash
python3 -m http.server 8080
```

Ardından `http://localhost:8080` adresini açın.

## Kontroller

- `WASD` / ok tuşları: hareket
- Fare: nişan, sol tık: hazır sticker'ı fırlat
- `1–4`: BOMBA, SALYANGOZ, ELEKTRİK ve PLATFORM baskısını kuyruğa ekle
- `E`: hazır sticker'ı fırlat
- `Boşluk`: kaçınma
- `Esc`: duraklat
- Mobil: iki sanal pad, sticker düğmeleri ve kaçınma düğmesi

## Uygulanan MVP kapsamı

- Dört odalı kısa koşu ve boss savaşı
- Süreli baskı kuyruğu, kâğıt maliyeti, ısı ve soğuma
- Görünür yüksek ısı sebebine bağlı kâğıt sıkışması mini eylemi
- Dört işlevsel sticker ve zincirleme elektrik etkisi
- Üç düşman tipi, saldırı işaretleri ve boss fazları
- Sticker ile çalışan çevresel jeneratör bulmacası
- Fare, klavye ve dokunmatik kontroller
- Tamamen çevrimdışı ve harici varlıksız çalışma
