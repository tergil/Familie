// GENERERT av npm run funksjoner fra supabase/kilde/kalender.ts – ikke rediger denne fila.
// Lim hele innholdet inn i Supabase → Edge Functions → kalender (eller: npx supabase functions deploy kalender --no-verify-jwt).
// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";
//#region src/logikk/lister.ts
const LISTETYPER = {
	sjekk: {
		navn: "Huskeliste",
		beskrivelse: "Vanlig liste med avkrysning",
		ikon: "📝",
		statuser: [{
			id: "apen",
			tekst: "Ikke gjort"
		}, {
			id: "ferdig",
			tekst: "Gjort"
		}],
		brukt: ["ferdig"],
		felt: [
			"dato",
			"belop",
			"lenke"
		]
	},
	gave: {
		navn: "Gaveliste",
		beskrivelse: "Idé → kjøpt → gitt, med mottaker og historikk",
		ikon: "🎁",
		statuser: [
			{
				id: "ide",
				tekst: "Idé"
			},
			{
				id: "kjopt",
				tekst: "Kjøpt"
			},
			{
				id: "gitt",
				tekst: "Gitt"
			}
		],
		brukt: ["kjopt", "gitt"],
		felt: [
			"mottaker",
			"belop",
			"lenke",
			"dato"
		]
	},
	onske: {
		navn: "Ønskeliste",
		beskrivelse: "Ting dere ønsker eller trenger, med pris",
		ikon: "✨",
		statuser: [{
			id: "onske",
			tekst: "Ønsker"
		}, {
			id: "kjopt",
			tekst: "Kjøpt"
		}],
		brukt: ["kjopt"],
		felt: [
			"belop",
			"lenke",
			"dato"
		]
	},
	oppgave: {
		navn: "Oppgaver",
		beskrivelse: "Ting som skal fikses, f.eks. av elektrikeren",
		ikon: "🔧",
		statuser: [
			{
				id: "apen",
				tekst: "Må fikses"
			},
			{
				id: "bestilt",
				tekst: "Bestilt"
			},
			{
				id: "ferdig",
				tekst: "Ferdig"
			}
		],
		brukt: ["ferdig"],
		felt: [
			"belop",
			"dato",
			"lenke"
		]
	},
	opplevelse: {
		navn: "Steder å besøke",
		beskrivelse: "Restauranter og opplevelser, med vurdering",
		ikon: "🍽️",
		statuser: [{
			id: "vil",
			tekst: "Vil prøve"
		}, {
			id: "besokt",
			tekst: "Besøkt"
		}],
		brukt: [],
		felt: [
			"vurdering",
			"lenke",
			"dato"
		]
	},
	serie: {
		navn: "Serier og filmer",
		beskrivelse: "Vil se → ser nå → sett, med vurdering",
		ikon: "📺",
		statuser: [
			{
				id: "vil",
				tekst: "Vil se"
			},
			{
				id: "ser",
				tekst: "Ser nå"
			},
			{
				id: "sett",
				tekst: "Sett"
			}
		],
		brukt: [],
		felt: ["vurdering", "lenke"]
	},
	hage: {
		navn: "Hage",
		beskrivelse: "Planter og ting, med stell per måned",
		ikon: "🌱",
		statuser: [{
			id: "apen",
			tekst: "Aktiv"
		}],
		brukt: [],
		felt: ["plassering", "maaneder"]
	},
	kalender: {
		navn: "Kalender",
		beskrivelse: "Luker med dato og idé, f.eks. adventskalender",
		ikon: "🕯️",
		statuser: [{
			id: "apen",
			tekst: "Ikke klar"
		}, {
			id: "klar",
			tekst: "Klar"
		}],
		brukt: ["klar"],
		felt: ["dato", "belop"]
	},
	gaveaar: {
		navn: "Gaveår",
		beskrivelse: "Faste mottakere med bursdag, jul og andre anledninger, idébank og budsjett per person",
		ikon: "🎂",
		statuser: [
			{
				id: "ide",
				tekst: "Idé"
			},
			{
				id: "kjopt",
				tekst: "Kjøpt"
			},
			{
				id: "gitt",
				tekst: "Gitt"
			}
		],
		brukt: ["kjopt", "gitt"],
		felt: ["belop", "lenke"]
	}
};
/** Statusen punktet har – ukjente statuser (f.eks. etter typebytte) regnes som den første */
function gyldigStatus(type, status) {
	const s = LISTETYPER[type].statuser;
	return s.some((x) => x.id === status) ? status : s[0].id;
}
function erFerdig(type, status) {
	const s = LISTETYPER[type].statuser;
	return s.length > 1 && gyldigStatus(type, status) === s[s.length - 1].id;
}
function erBrukt(type, status) {
	return LISTETYPER[type].brukt.includes(gyldigStatus(type, status));
}
const DAG$1 = 864e5;
function utc$1(iso) {
	const [a, m, d] = iso.split("-").map(Number);
	return Date.UTC(a, m - 1, d);
}
/** Dager fra a til b (b − a), uavhengig av sommertid */
function dagerMellom(a, b) {
	return Math.round((utc$1(b) - utc$1(a)) / DAG$1);
}
//#endregion
//#region src/logikk/gaveaar.ts
const ANLEDNING_NAVN = {
	bursdag: "Bursdag",
	jul: "Jul",
	morsdag: "Morsdag",
	farsdag: "Farsdag",
	egen: "Annen anledning"
};
/** Alderen personen fyller på datoen (fødselsdato ÅÅÅÅ-MM-DD) */
function alder(fodt, dato) {
	if (!fodt || !/^\d{4}-\d{2}-\d{2}$/.test(fodt)) return void 0;
	const aar = Number(dato.slice(0, 4)) - Number(fodt.slice(0, 4)) - (dato.slice(5) < fodt.slice(5) ? 1 : 0);
	return aar >= 0 ? aar : void 0;
}
const pad = (n) => String(n).padStart(2, "0");
/** Andre søndag i måneden (morsdag i februar, farsdag i november) */
function andreSondag(aar, maaned) {
	const ukedag = new Date(Date.UTC(aar, maaned - 1, 1)).getUTCDay();
	return `${aar}-${pad(maaned)}-${pad(1 + (7 - ukedag) % 7 + 7)}`;
}
/** Datoen anledningen faller på i året, eller null (mangler dato, eller én gang i et annet år) */
function anledningsDato(a, aar) {
	if (a.aar && a.aar !== aar) return null;
	switch (a.type) {
		case "jul": return `${aar}-12-24`;
		case "morsdag": return andreSondag(aar, 2);
		case "farsdag": return andreSondag(aar, 11);
		default: return a.dag ? `${aar}-${a.dag}` : null;
	}
}
function anledningsNavn(a) {
	return a.type === "egen" ? a.navn?.trim() || ANLEDNING_NAVN.egen : ANLEDNING_NAVN[a.type];
}
/** Gavelistene som er gaveår (ikke maler) */
const gaveaar = (lister) => lister.filter((l) => !l.mal && l.type === "gaveaar");
/** Mottakerne i et gaveår: hovedpunktene */
const mottakere = (listeId, punkter) => punkter.filter((p) => p.listeId === listeId && !p.forelderId).sort((a, b) => a.rekkefolge - b.rekkefolge);
//#endregion
//#region src/logikk/kalender.ts
/** Kategoriene dere starter med. Kan endres, legges til og slettes i kalenderen (lagres i fellesdokumentet). */
const STANDARD_KALENDERKATEGORIER = [
	{
		id: "barnehage",
		navn: "Barnehage/skole",
		farge: 1
	},
	{
		id: "trening",
		navn: "Trening og aktivitet",
		farge: 4
	},
	{
		id: "sosialt",
		navn: "Sosialt",
		farge: 6
	},
	{
		id: "mote",
		navn: "Møte",
		farge: 5
	},
	{
		id: "besok",
		navn: "Besøk og reise",
		farge: 2
	},
	{
		id: "annet",
		navn: "Annet",
		farge: 7
	}
];
const DAG = 864e5;
const utc = (iso) => {
	const [a, m, d] = iso.split("-").map(Number);
	return Date.UTC(a, m - 1, d);
};
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const leggTilDager = (dato, n) => iso(utc(dato) + n * DAG);
/** 1 = mandag … 7 = søndag */
function ukedag(dato) {
	const d = new Date(utc(dato)).getUTCDay();
	return d === 0 ? 7 : d;
}
const mandagI = (dato) => leggTilDager(dato, 1 - ukedag(dato));
/** Minutter fra midnatt for «HH:MM» */
const minutter = (tid) => Number(tid.slice(0, 2)) * 60 + Number(tid.slice(3, 5));
/** Faller serien på datoen? (Unntak ikke medregnet.) */
function treffer(h, d) {
	const g = h.gjentak;
	if (!g) return d === h.dato;
	if (d < h.dato || g.til && d > g.til) return false;
	const n = Math.max(1, g.intervall || 1);
	const aar = (x) => Number(x.slice(0, 4));
	const mnd = (x) => Number(x.slice(5, 7));
	switch (g.frekvens) {
		case "dag": return dagerMellom(h.dato, d) % n === 0;
		case "uke":
			if (!(g.ukedager?.length ? g.ukedager : [ukedag(h.dato)]).includes(ukedag(d))) return false;
			return dagerMellom(mandagI(h.dato), mandagI(d)) / 7 % n === 0;
		case "maaned": return d.slice(8) === h.dato.slice(8) && ((aar(d) - aar(h.dato)) * 12 + mnd(d) - mnd(h.dato)) % n === 0;
		case "aar": return d.slice(5) === h.dato.slice(5) && (aar(d) - aar(h.dato)) % n === 0;
	}
}
/** Hvor mange dager en avtale varer utover startdagen */
const varighet = (h) => h.sluttDato && h.sluttDato > h.dato ? dagerMellom(h.dato, h.sluttDato) : 0;
/** Alle forekomster som overlapper perioden fra–til (inklusiv), sortert på dato og tid */
function forekomster(hendelser, fra, til) {
	const serier = hendelser.filter((h) => !h.serieId);
	const unntak = new Map(hendelser.filter((h) => h.serieId && h.originalDato).map((h) => [`${h.serieId}|${h.originalDato}`, h]));
	const ut = [];
	for (const serie of serier) {
		const lengde = varighet(serie);
		const start = [serie.dato, leggTilDager(fra, -lengde)].sort()[1];
		const slutt = [til, serie.gjentak?.til ?? (serie.gjentak ? til : serie.dato)].sort()[0];
		for (let d = start; d <= slutt; d = leggTilDager(d, 1)) {
			if (!treffer(serie, d)) continue;
			const nokkel = `${serie.id}|${d}`;
			const u = unntak.get(nokkel);
			if (u) {
				if (!u.avlyst && u.dato <= til && leggTilDager(u.dato, varighet(u)) >= fra) ut.push({
					nokkel,
					serie,
					hendelse: {
						...u,
						gjentak: serie.gjentak
					},
					dato: u.dato,
					originalDato: d,
					unntak: u
				});
				continue;
			}
			ut.push({
				nokkel,
				serie,
				hendelse: serie,
				dato: d,
				originalDato: d
			});
		}
	}
	for (const u of unntak.values()) {
		const serie = serier.find((s) => s.id === u.serieId);
		if (!serie || u.avlyst || u.dato < fra || u.dato > til || ut.some((f) => f.unntak?.id === u.id)) continue;
		if (!treffer(serie, u.originalDato)) continue;
		ut.push({
			nokkel: `${serie.id}|${u.originalDato}`,
			serie,
			hendelse: {
				...u,
				gjentak: serie.gjentak
			},
			dato: u.dato,
			originalDato: u.originalDato,
			unntak: u
		});
	}
	return ut.sort((a, b) => a.dato.localeCompare(b.dato) || (a.hendelse.fra ?? "").localeCompare(b.hendelse.fra ?? "") || a.hendelse.tittel.localeCompare(b.hendelse.tittel, "nb"));
}
/** Avtaler, anledninger fra gaveårene (unntatt jul) og frister fra listene i perioden */
function kalenderPoster(hendelser, lister, punkter, fra, til, valg = {
	anledninger: true,
	frister: true
}, kategorier = STANDARD_KALENDERKATEGORIER) {
	const ut = forekomster(hendelser, fra, til).map((f) => {
		const h = f.hendelse;
		const farge = kategorier.find((k) => k.id === h.kategori)?.farge ?? -1;
		const forskyvning = varighet(h);
		return {
			nokkel: f.nokkel,
			dato: f.dato,
			sluttDato: forskyvning ? leggTilDager(f.dato, forskyvning) : void 0,
			fra: h.fra,
			til: h.til,
			tittel: h.tittel,
			farge,
			hvem: h.hvem ?? [],
			ansvarlig: h.ansvarlig,
			sted: h.sted,
			notat: h.notat,
			kilde: "avtale",
			forekomst: f,
			gjentar: !!f.serie.gjentak,
			endret: !!f.unntak
		};
	});
	if (valg.anledninger) {
		const sett = /* @__PURE__ */ new Set();
		const forste = Number(fra.slice(0, 4));
		const siste = Number(til.slice(0, 4));
		for (const liste of gaveaar(lister)) for (const m of mottakere(liste.id, punkter)) for (const a of m.anledninger ?? []) {
			if (a.type === "jul") continue;
			for (let aar = forste; aar <= siste; aar++) {
				const dato = anledningsDato(a, aar);
				if (!dato || dato < fra || dato > til) continue;
				const nokkel = `${m.tekst.trim().toLowerCase()}|${anledningsNavn(a).toLowerCase()}|${dato}`;
				if (sett.has(nokkel)) continue;
				sett.add(nokkel);
				const fyller = a.type === "bursdag" ? alder(m.fodt, dato) : void 0;
				ut.push({
					nokkel: `anledning|${m.id}|${a.id}|${dato}`,
					dato,
					kilde: "anledning",
					hvem: [],
					farge: 0,
					tittel: a.type === "bursdag" ? `${m.tekst} har bursdag${fyller !== void 0 ? ` (${fyller} år)` : ""}` : `${anledningsNavn(a)} – ${m.tekst}`,
					url: `#/lister/${liste.id}`
				});
			}
		}
	}
	if (valg.frister) {
		const aktuelle = new Map(lister.filter((l) => !l.mal && l.type !== "kalender" && l.type !== "hage" && l.type !== "gaveaar").map((l) => [l.id, l]));
		for (const p of punkter) {
			const l = aktuelle.get(p.listeId);
			if (!l || !p.dato || p.dato < fra || p.dato > til || erFerdig(l.type, p.status) || erBrukt(l.type, p.status)) continue;
			ut.push({
				nokkel: `frist|${p.id}`,
				dato: p.dato,
				kilde: "frist",
				hvem: [],
				farge: 3,
				tittel: `Frist: ${p.tekst}`,
				url: `#/lister/${l.id}`
			});
		}
	}
	return ut.sort((a, b) => a.dato.localeCompare(b.dato) || (a.fra ?? "").localeCompare(b.fra ?? "") || a.tittel.localeCompare(b.tittel, "nb"));
}
//#endregion
//#region src/logikk/ics.ts
/** Norsk tid med sommertid, så klokkeslettene blir riktige på telefonen */
const TIDSSONE = [
	"BEGIN:VTIMEZONE",
	"TZID:Europe/Oslo",
	"BEGIN:DAYLIGHT",
	"TZOFFSETFROM:+0100",
	"TZOFFSETTO:+0200",
	"TZNAME:CEST",
	"DTSTART:19700329T020000",
	"RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
	"END:DAYLIGHT",
	"BEGIN:STANDARD",
	"TZOFFSETFROM:+0200",
	"TZOFFSETTO:+0100",
	"TZNAME:CET",
	"DTSTART:19701025T030000",
	"RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
	"END:STANDARD",
	"END:VTIMEZONE"
];
/** Tekst i ICS: \ ; , og linjeskift må beskyttes */
const icsTekst = (s) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Linjer over 75 byte brytes (fortsettelse starter med mellomrom), uten å dele et tegn */
function brett(linje) {
	const koder = new TextEncoder();
	const deler = [];
	let naa = "";
	let lengde = 0;
	for (const tegn of linje) {
		const n = koder.encode(tegn).length;
		if (lengde + n > (deler.length ? 74 : 75)) {
			deler.push(naa);
			naa = "";
			lengde = 0;
		}
		naa += tegn;
		lengde += n;
	}
	deler.push(naa);
	return deler.join("\r\n ");
}
const dato8 = (d) => d.replace(/-/g, "");
const tid6 = (t) => `${t.slice(0, 2)}${t.slice(3, 5)}00`;
const tilTid = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
function lagIcs(poster, navn, naa = /* @__PURE__ */ new Date(), kalendernavn = "Familie") {
	const stempel = naa.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
	const linjer = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Familie//Kalender//NO",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		`X-WR-CALNAME:${icsTekst(kalendernavn)}`,
		"X-WR-TIMEZONE:Europe/Oslo",
		"REFRESH-INTERVAL;VALUE=DURATION:PT1H",
		"X-PUBLISHED-TTL:PT1H",
		...TIDSSONE
	];
	for (const p of poster) {
		const hvem = p.hvem.map(navn).filter(Boolean);
		const ansvarlig = p.ansvarlig ? navn(p.ansvarlig) : void 0;
		const beskrivelse = [
			hvem.length ? `Gjelder: ${hvem.join(", ")}` : "",
			ansvarlig ? `Henter/leverer: ${ansvarlig}` : "",
			p.notat ?? ""
		].filter(Boolean).join("\n");
		linjer.push("BEGIN:VEVENT", `UID:${p.nokkel.replace(/[^A-Za-z0-9-]/g, "-")}@familie`, `DTSTAMP:${stempel}`);
		if (p.fra) {
			const start = minutter(p.fra);
			const slutt = p.til ? minutter(p.til) : start + 60;
			const sluttDato = p.sluttDato ?? (slutt <= start ? leggTilDager(p.dato, 1) : p.dato);
			linjer.push(`DTSTART;TZID=Europe/Oslo:${dato8(p.dato)}T${tid6(p.fra)}`, `DTEND;TZID=Europe/Oslo:${dato8(sluttDato)}T${tid6(p.til ?? tilTid(Math.min(start + 60, 1439)))}`);
		} else linjer.push(`DTSTART;VALUE=DATE:${dato8(p.dato)}`, `DTEND;VALUE=DATE:${dato8(leggTilDager(p.sluttDato ?? p.dato, 1))}`, "TRANSP:TRANSPARENT");
		linjer.push(`SUMMARY:${icsTekst(`${p.tittel}${ansvarlig ? ` (${ansvarlig})` : ""}`)}`);
		if (p.sted) linjer.push(`LOCATION:${icsTekst(p.sted)}`);
		if (beskrivelse) linjer.push(`DESCRIPTION:${icsTekst(beskrivelse)}`);
		linjer.push("END:VEVENT");
	}
	linjer.push("END:VCALENDAR");
	return linjer.map(brett).join("\r\n") + "\r\n";
}
//#endregion
//#region src/logikk/varsler.ts
/** Dato, time og minutt fra midnatt akkurat nå i Norge (serveren går i UTC) */
function norskTid(naa = /* @__PURE__ */ new Date()) {
	const deler = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Oslo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23"
	}).formatToParts(naa).map((d) => [d.type, d.value]));
	const time = Number(deler.hour);
	return {
		dato: `${deler.year}-${deler.month}-${deler.day}`,
		time,
		minutt: time * 60 + Number(deler.minute)
	};
}
//#endregion
//#region supabase/kilde/felles.ts
const tilListe = (r) => ({
	eier: r.eier ?? null,
	liste: {
		...r.ekstra ?? {},
		id: r.id,
		navn: r.navn,
		ikon: r.ikon,
		kategori: r.kategori,
		type: r.type,
		privat: r.eier !== null,
		mal: r.mal,
		rekkefolge: Number(r.rekkefolge),
		opprettet: String(r.opprettet).slice(0, 10)
	}
});
const tilPunkt = (r) => ({
	...r.ekstra ?? {},
	id: r.id,
	listeId: r.liste_id,
	forelderId: r.forelder_id,
	tekst: r.tekst,
	notat: r.notat ?? "",
	status: r.status,
	belop: r.belop === null ? null : Number(r.belop),
	dato: r.dato,
	rekkefolge: Number(r.rekkefolge)
});
const tilHendelse = (r) => ({
	...r.ekstra ?? {},
	id: r.id,
	tittel: r.tittel,
	dato: r.dato,
	serieId: r.serie_id ?? void 0,
	originalDato: r.original_dato ?? void 0,
	avlyst: r.avlyst ? true : void 0
});
/** Alt varsler og kalender trenger: lister, punkter, avtaler og fellesdokumentet (personer, familie, kalendernøkkel) */
async function hentAlt(db) {
	const [l, p, h, f] = await Promise.all([
		db.from("liste").select("id, eier, navn, ikon, kategori, type, mal, rekkefolge, ekstra, opprettet").limit(5e3),
		db.from("listepunkt").select("id, liste_id, forelder_id, tekst, notat, status, belop, dato, rekkefolge, ekstra").limit(5e4),
		db.from("hendelse").select("id, serie_id, original_dato, avlyst, tittel, dato, ekstra").limit(2e4),
		db.from("felles_dok").select("data").eq("id", 1).maybeSingle()
	]);
	const feil = l.error ?? p.error ?? f.error;
	if (feil) throw new Error(feil.message);
	return {
		lister: (l.data ?? []).map(tilListe),
		punkter: (p.data ?? []).map(tilPunkt),
		hendelser: h.error ? [] : (h.data ?? []).map(tilHendelse),
		felles: f.data?.data ?? null
	};
}
/** Navn på personer og familiemedlemmer */
function navnFra(felles) {
	const alle = new Map([...felles?.personer ?? [], ...felles?.familie ?? []].map((p) => [p.id, p.navn]));
	return (id) => alle.get(id);
}
//#endregion
//#region supabase/kilde/kalender.ts
Deno.serve(async (req) => {
	try {
		const nokkel = new URL(req.url).searchParams.get("n") ?? "";
		const { lister, punkter, hendelser, felles } = await hentAlt(createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""));
		if (!felles?.kalenderNokkel || nokkel.length < 32 || nokkel !== felles.kalenderNokkel) return new Response("Finnes ikke", { status: 404 });
		const { dato } = norskTid();
		const fellesLister = lister.filter((x) => x.eier === null).map((x) => x.liste);
		const ider = new Set(fellesLister.map((x) => x.id));
		const poster = kalenderPoster(hendelser, fellesLister, punkter.filter((x) => ider.has(x.listeId)), leggTilDager(dato, -60), leggTilDager(dato, 400), {
			anledninger: true,
			frister: false
		});
		return new Response(lagIcs(poster, navnFra(felles)), { headers: {
			"Content-Type": "text/calendar; charset=utf-8",
			"Cache-Control": "max-age=900",
			"Content-Disposition": "inline; filename=\"familie.ics\""
		} });
	} catch (e) {
		console.error(e);
		return new Response(`Feil: ${e instanceof Error ? e.message : e}`, { status: 500 });
	}
});
//#endregion
