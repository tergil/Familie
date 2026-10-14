// GENERERT av npm run varsel-funksjon fra supabase/kilde/varsler.ts – ikke rediger denne fila.
// Lim hele innholdet inn i Supabase → Edge Functions → varsler (eller: npx supabase functions deploy varsler --no-verify-jwt).
// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
//#region src/data/modell.ts
const STANDARD_VARSLER = {
	time: 8,
	bareUtenGave: true,
	typer: {
		bursdag: {
			pa: true,
			dager: [21, 0]
		},
		jul: {
			pa: true,
			dager: [21]
		},
		andre: {
			pa: true,
			dager: [21, 0]
		},
		frist: {
			pa: true,
			dager: [3, 0]
		},
		kalender: {
			pa: false,
			dager: [0]
		},
		hage: {
			pa: true,
			dager: [0]
		}
	}
};
//#endregion
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
const DAG = 864e5;
function utc(iso) {
	const [a, m, d] = iso.split("-").map(Number);
	return Date.UTC(a, m - 1, d);
}
/** Dager fra a til b (b − a), uavhengig av sommertid */
function dagerMellom(a, b) {
	return Math.round((utc(b) - utc(a)) / DAG);
}
/** Punkter med dato innen horisonten (eller forfalt) som ikke er ferdige. Kalenderluker og maler er ikke med. */
function huskelapp(lister, punkter, iDag, horisont = 14) {
	const aktuelle = new Map(lister.filter((l) => !l.mal && l.type !== "kalender" && l.type !== "hage").map((l) => [l.id, l]));
	const ut = [];
	for (const p of punkter) {
		const liste = aktuelle.get(p.listeId);
		if (!liste || !p.dato || erFerdig(liste.type, p.status) || erBrukt(liste.type, p.status)) continue;
		const dager = dagerMellom(iDag, p.dato);
		if (dager <= horisont) ut.push({
			punkt: p,
			liste,
			dager
		});
	}
	return ut.sort((a, b) => a.dager - b.dager);
}
/** Hagepunkter som skal gjøres i måneden til iDag */
function hageIMaaned(lister, punkter, iDag) {
	const maaned = Number(iDag.slice(5, 7));
	const hager = new Map(lister.filter((l) => !l.mal && l.type === "hage").map((l) => [l.id, l]));
	return punkter.filter((p) => hager.has(p.listeId) && p.maaneder?.includes(maaned)).map((p) => ({
		punkt: p,
		liste: hager.get(p.listeId),
		forelder: p.forelderId ? punkter.find((f) => f.id === p.forelderId) : void 0,
		gjort: !!p.sistGjort && p.sistGjort.slice(0, 7) === iDag.slice(0, 7)
	})).sort((a, b) => Number(a.gjort) - Number(b.gjort) || a.punkt.rekkefolge - b.punkt.rekkefolge);
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
const ANLEDNING_IKON = {
	bursdag: "🎂",
	jul: "🎄",
	morsdag: "💐",
	farsdag: "👔",
	egen: "🎉"
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
const anledningsNokkel = (a, aar) => `${a.id}:${aar}`;
/** Gavelistene som er gaveår (ikke maler) */
const gaveaar = (lister) => lister.filter((l) => !l.mal && l.type === "gaveaar");
/** Mottakerne i et gaveår: hovedpunktene */
const mottakere = (listeId, punkter) => punkter.filter((p) => p.listeId === listeId && !p.forelderId).sort((a, b) => a.rekkefolge - b.rekkefolge);
/** Gaver og ideer til en mottaker */
const gaverTil = (mottakerId, punkter) => punkter.filter((p) => p.forelderId === mottakerId).sort((a, b) => a.rekkefolge - b.rekkefolge);
/** Alle anledninger de neste 12 månedene (fra i dag), sortert på dato */
function forekomster(lister, punkter, iDag, dagerFrem = 365) {
	const iAar = Number(iDag.slice(0, 4));
	const ut = [];
	for (const liste of gaveaar(lister)) for (const mottaker of mottakere(liste.id, punkter)) {
		const alle = gaverTil(mottaker.id, punkter);
		const ideer = alle.filter((g) => !g.anledning && !erBrukt("gaveaar", g.status)).length;
		for (const anledning of mottaker.anledninger ?? []) for (const aar of [iAar, iAar + 1]) {
			const dato = anledningsDato(anledning, aar);
			if (!dato) continue;
			const dager = dagerMellom(iDag, dato);
			if (dager < 0 || dager > dagerFrem) continue;
			const nokkel = anledningsNokkel(anledning, aar);
			ut.push({
				liste,
				mottaker,
				anledning,
				aar,
				dato,
				dager,
				nokkel,
				gaver: alle.filter((g) => g.anledning === nokkel),
				ideer,
				alder: anledning.type === "bursdag" ? alder(mottaker.fodt, dato) : void 0
			});
		}
	}
	return ut.sort((a, b) => a.dato.localeCompare(b.dato) || a.mottaker.tekst.localeCompare(b.mottaker.tekst, "nb"));
}
//#endregion
//#region src/logikk/varsler.ts
const MAANEDER = [
	"januar",
	"februar",
	"mars",
	"april",
	"mai",
	"juni",
	"juli",
	"august",
	"september",
	"oktober",
	"november",
	"desember"
];
/** «I dag», «I morgen», «Om 3 dager» */
function naarTekst(dager) {
	return dager === 0 ? "i dag" : dager === 1 ? "i morgen" : `om ${dager} dager`;
}
/** «fre. 30. okt.» */
function datoKort(iso) {
	const [a, m, d] = iso.split("-").map(Number);
	return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString("nb-NO", {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "UTC"
	});
}
/**
* Hvilket varseltrinn gjelder i dag? Trinnene er dager før (f.eks. [21, 0]).
* Det minste trinnet som er ≥ dagene som er igjen, sendes. Større trinn som ble hoppet over
* (f.eks. når noe legges inn sent) merkes som sendt, så de ikke kommer etterpå.
* Samme dag (0) gjelder bare på selve dagen.
*/
function varseltrinn(dager, trinn) {
	if (dager < 0) return null;
	const aktuelle = [...new Set(trinn)].filter((t) => dager <= t).sort((a, b) => a - b);
	return aktuelle.length ? {
		trinn: aktuelle[0],
		alle: aktuelle
	} : null;
}
/** Alle varsler som er aktuelle i dag for én bruker. Listene skal være de brukeren kan se. */
function beregnVarsler(lister, punkter, inn, iDag) {
	const ut = [];
	const t = inn.typer;
	const maksTrinn = Math.max(0, ...Object.values(t).filter((v) => v.pa).flatMap((v) => v.dager));
	const kjoptTekst = (gaver) => gaver.filter((g) => erBrukt("gaveaar", g.status)).map((g) => g.tekst).join(", ");
	const alle = forekomster(lister, punkter, iDag, maksTrinn);
	for (const f of alle) {
		const type = f.anledning.type === "bursdag" ? "bursdag" : f.anledning.type === "jul" ? "jul" : "andre";
		if (type === "jul" || !t[type].pa) continue;
		const valg = varseltrinn(f.dager, t[type].dager);
		if (!valg) continue;
		const kjopt = kjoptTekst(f.gaver);
		if (valg.trinn > 0 && inn.bareUtenGave && kjopt) continue;
		const base = `${type}:${f.mottaker.id}:${f.anledning.id}:${f.dato}`;
		const navn = f.mottaker.tekst;
		const ikon = ANLEDNING_IKON[f.anledning.type];
		const hva = type === "bursdag" ? `${navn} har bursdag${f.alder !== void 0 ? ` (fyller ${f.alder})` : ""}` : `${anledningsNavn(f.anledning)} – ${navn}`;
		ut.push({
			type,
			nokkel: `${base}:${valg.trinn}`,
			nokler: valg.alle.map((x) => `${base}:${x}`),
			tittel: `${ikon} ${hva} ${naarTekst(f.dager)}`,
			tekst: kjopt ? `Gave: ${kjopt}` : f.dager === 0 ? "Ingen gave er registrert." : `${datoKort(f.dato)}: ingen gave kjøpt ennå${f.ideer ? ` – ${f.ideer} ${f.ideer === 1 ? "idé" : "ideer"} i idébanken` : ""}.`,
			url: `#/lister/${f.liste.id}`
		});
	}
	if (t.jul.pa) {
		const jul = alle.filter((f) => f.anledning.type === "jul");
		if (jul.length) {
			const { dato, dager, aar } = jul[0];
			const valg = varseltrinn(dager, t.jul.dager);
			const personer = [...new Set(jul.map((f) => f.mottaker.tekst.trim().toLowerCase()))];
			const medGave = new Set(jul.filter((f) => f.gaver.some((g) => erBrukt("gaveaar", g.status))).map((f) => f.mottaker.tekst.trim().toLowerCase()));
			const alleKjopt = medGave.size >= personer.length;
			if (valg && !(valg.trinn > 0 && inn.bareUtenGave && alleKjopt)) {
				const base = `jul:${dato}`;
				ut.push({
					type: "jul",
					nokkel: `${base}:${valg.trinn}`,
					nokler: valg.alle.map((x) => `${base}:${x}`),
					tittel: dager === 0 ? "🎄 God jul!" : `🎄 Jul ${naarTekst(dager)}`,
					tekst: `Gave kjøpt til ${medGave.size} av ${personer.length}.`,
					url: `#/lister/plan/jul/${aar}`
				});
			}
		}
	}
	if (t.frist.pa) for (const h of huskelapp(lister, punkter, iDag, maksTrinn)) {
		const valg = varseltrinn(h.dager, t.frist.dager);
		if (!valg) continue;
		const base = `frist:${h.punkt.id}:${h.punkt.dato}`;
		ut.push({
			type: "frist",
			nokkel: `${base}:${valg.trinn}`,
			nokler: valg.alle.map((x) => `${base}:${x}`),
			tittel: `${h.liste.ikon} ${h.dager === 0 ? "I dag" : h.dager === 1 ? "I morgen" : `Om ${h.dager} dager`}: ${h.punkt.tekst}`,
			tekst: `${h.liste.navn} · frist ${datoKort(h.punkt.dato)}`,
			url: `#/lister/${h.liste.id}`
		});
	}
	if (t.kalender.pa) {
		const kalendere = new Map(lister.filter((l) => !l.mal && l.type === "kalender").map((l) => [l.id, l]));
		for (const p of punkter) {
			const liste = kalendere.get(p.listeId);
			if (!liste || !p.dato) continue;
			const dager = dagerMellom(iDag, p.dato);
			const valg = varseltrinn(dager, t.kalender.dager);
			if (!valg) continue;
			const base = `kalender:${p.id}:${p.dato}`;
			ut.push({
				type: "kalender",
				nokkel: `${base}:${valg.trinn}`,
				nokler: valg.alle.map((x) => `${base}:${x}`),
				tittel: `${liste.ikon} ${dager === 0 ? "Luke i dag" : `Luke ${naarTekst(dager)}`}: ${p.tekst}`,
				tekst: p.notat || (erFerdig("kalender", p.status) ? "Klar." : "Ingen idé lagt inn ennå."),
				url: `#/lister/${liste.id}`
			});
		}
	}
	if (t.hage.pa && iDag.endsWith("-01")) {
		const oppgaver = hageIMaaned(lister, punkter, iDag).filter((o) => !o.gjort);
		if (oppgaver.length) ut.push({
			type: "hage",
			nokkel: `hage:${iDag.slice(0, 7)}`,
			nokler: [`hage:${iDag.slice(0, 7)}`],
			tittel: `🌱 I hagen i ${MAANEDER[Number(iDag.slice(5, 7)) - 1]}`,
			tekst: oppgaver.map((o) => o.forelder ? `${o.forelder.tekst}: ${o.punkt.tekst.toLowerCase()}` : o.punkt.tekst).join(", "),
			url: `#/lister/${oppgaver[0].liste.id}`
		});
	}
	return ut;
}
/** Mange varsler samme dag blir ett samlet varsel, så telefonen ikke fylles opp */
function slaaSammen(varsler, maks = 3) {
	if (varsler.length <= maks) return varsler.map((v) => ({
		tittel: v.tittel,
		tekst: v.tekst,
		url: v.url,
		nokler: v.nokler
	}));
	return [{
		tittel: `${varsler.length} påminnelser i dag`,
		tekst: varsler.slice(0, 4).map((v) => v.tittel).join("\n") + (varsler.length > 4 ? `\n… og ${varsler.length - 4} til` : ""),
		url: "#/oversikt",
		nokler: varsler.flatMap((v) => v.nokler)
	}];
}
/** Dato og time akkurat nå i Norge (serveren går i UTC) */
function norskTid(naa = /* @__PURE__ */ new Date()) {
	const deler = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Oslo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		hourCycle: "h23"
	}).formatToParts(naa).map((d) => [d.type, d.value]));
	return {
		dato: `${deler.year}-${deler.month}-${deler.day}`,
		time: Number(deler.hour)
	};
}
//#endregion
//#region supabase/kilde/varsler.ts
const env = (n) => Deno.env.get(n) ?? "";
const svar = (data, status = 200) => new Response(JSON.stringify(data), {
	status,
	headers: {
		"Content-Type": "application/json",
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
	}
});
/** Feil fra siste sending, så de kan vises i svaret (ikke bare i loggen) */
let sendefeil = [];
/** Sender til alle enhetene. Enheter som ikke finnes lenger (404/410), slettes. */
async function send(db, enheter, melding) {
	let sendt = 0;
	for (const e of enheter) try {
		await webpush.sendNotification({
			endpoint: e.endpoint,
			keys: {
				p256dh: e.p256dh,
				auth: e.auth
			}
		}, JSON.stringify(melding), { TTL: 72e3 });
		sendt++;
	} catch (feil) {
		const f = feil;
		if (f.statusCode === 404 || f.statusCode === 410) {
			await db.from("varsel_abonnement").delete().eq("id", e.id);
			sendefeil.push(`${new URL(e.endpoint).host}: enheten finnes ikke lenger (${f.statusCode}) – slettet`);
		} else {
			console.error("Kunne ikke sende", f.statusCode, feil);
			sendefeil.push(`${new URL(e.endpoint).host}: ${f.statusCode ?? ""} ${(f.body || f.message || String(feil)).slice(0, 300)}`.trim());
		}
	}
	return sendt;
}
Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return svar("ok");
	try {
		return await behandle(req);
	} catch (e) {
		console.error(e);
		return svar({ feil: e instanceof Error ? e.message : String(e) }, 500);
	}
});
async function behandle(req) {
	sendefeil = [];
	const mangler = [
		"VAPID_PUBLIC_KEY",
		"VAPID_PRIVATE_KEY",
		"CRON_HEMMELIGHET"
	].filter((n) => !env(n));
	if (mangler.length) return svar({ feil: `Mangler hemmelighet i Supabase (Edge Functions → Secrets): ${mangler.join(", ")}` }, 500);
	const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
	try {
		webpush.setVapidDetails(env("VAPID_SUBJECT") || "https://tergil.github.io/sulamitten/", env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
	} catch (e) {
		return svar({ feil: `VAPID-nøklene er ugyldige – sjekk at de er limt inn helt, uten mellomrom: ${e instanceof Error ? e.message : e}` }, 500);
	}
	const kropp = await req.json().catch(() => ({}));
	if (kropp.handling === "test") {
		const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
		const { data } = await db.auth.getUser(jwt);
		if (!data.user) return svar({ feil: "Ikke innlogget" }, 401);
		const { data: enheter } = await db.from("varsel_abonnement").select("id, bruker, endpoint, p256dh, auth").eq("bruker", data.user.id);
		const n = await send(db, enheter ?? [], {
			tittel: "🔔 Testvarsel",
			tekst: "Varslene virker på denne enheten.",
			url: "#/varsler"
		});
		if (!n && sendefeil.length) return svar({
			feil: `Push-tjenesten sa nei: ${sendefeil.join(" | ")}`,
			sendt: 0,
			enheter: enheter?.length ?? 0
		}, 502);
		return svar({
			sendt: n,
			enheter: enheter?.length ?? 0,
			feil: sendefeil.length ? sendefeil : void 0
		});
	}
	if (!env("CRON_HEMMELIGHET") || req.headers.get("x-cron-hemmelighet") !== env("CRON_HEMMELIGHET")) return svar({ feil: "Ikke tilgang" }, 401);
	const { dato, time } = norskTid();
	const { data: innstillinger, error } = await db.from("varsel_innstilling").select("bruker, data");
	if (error) return svar({ feil: error.message }, 500);
	const aktuelle = (innstillinger ?? []).map((r) => ({
		bruker: r.bruker,
		inn: {
			...STANDARD_VARSLER,
			...r.data
		}
	})).filter((r) => kropp.tving || r.inn.time === time);
	if (!aktuelle.length) return svar({
		dato,
		time,
		brukere: 0
	});
	const [l, p] = await Promise.all([db.from("liste").select("id, eier, navn, ikon, kategori, type, mal, rekkefolge, ekstra, opprettet").limit(5e3), db.from("listepunkt").select("id, liste_id, forelder_id, tekst, notat, status, belop, dato, rekkefolge, ekstra").limit(5e4)]);
	if (l.error || p.error) return svar({ feil: (l.error ?? p.error).message }, 500);
	const lister = (l.data ?? []).map((r) => ({
		eier: r.eier,
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
	}));
	const punkter = (p.data ?? []).map((r) => ({
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
	}));
	const resultat = {};
	for (const { bruker, inn } of aktuelle) {
		const synlige = lister.filter((x) => x.eier === null || x.eier === bruker).map((x) => x.liste);
		const ider = new Set(synlige.map((x) => x.id));
		const kandidater = beregnVarsler(synlige, punkter.filter((x) => ider.has(x.listeId)), inn, dato);
		if (!kandidater.length) continue;
		const { data: sendtFor } = await db.from("varsel_sendt").select("nokkel").eq("bruker", bruker).in("nokkel", kandidater.map((k) => k.nokkel));
		const sendt = new Set((sendtFor ?? []).map((r) => r.nokkel));
		const nye = kandidater.filter((k) => !sendt.has(k.nokkel));
		if (!nye.length) continue;
		const { data: enheter } = await db.from("varsel_abonnement").select("id, bruker, endpoint, p256dh, auth").eq("bruker", bruker);
		if (!enheter?.length) continue;
		let antall = 0;
		for (const melding of slaaSammen(nye)) if (await send(db, enheter, melding)) {
			antall++;
			await db.from("varsel_sendt").upsert(melding.nokler.map((nokkel) => ({
				bruker,
				nokkel
			})), {
				onConflict: "bruker,nokkel",
				ignoreDuplicates: true
			});
		}
		resultat[bruker] = antall;
	}
	return svar({
		dato,
		time,
		brukere: aktuelle.length,
		sendt: resultat,
		feil: sendefeil.length ? sendefeil : void 0
	});
}
//#endregion
