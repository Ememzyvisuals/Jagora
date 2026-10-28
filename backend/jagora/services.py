"""Where things are done in Nigeria: the official site for each common task, so Jagora goes straight to the right
place instead of trusting search results. The agent sees this as a short directory in its instructions; the guard
treats every domain here as official."""

from __future__ import annotations

# task -> (official site, who runs it, what to look for there)
SERVICES: list[tuple[str, str, str, str]] = [
    # exams and schools
    ("JAMB registration, UTME/DE, results, admission status (CAPS), brochure", "https://www.jamb.gov.ng", "JAMB", "e-Facility portal: efacility.jamb.gov.ng; brochure and syllabus pages"),
    ("WAEC result checking", "https://www.waecdirect.org", "WAEC", "needs exam number, year and scratch card PIN/serial (private)"),
    ("WAEC registration and news", "https://www.waec.org.ng", "WAEC", ""),
    ("NECO results and registration", "https://result.neco.gov.ng", "NECO", "main site neco.gov.ng"),
    ("NABTEB results", "https://eworld.nabteb.gov.ng", "NABTEB", ""),
    ("University admission requirements, cut-offs, fees", "the university's own .edu.ng site", "each university", "admission or prospective students pages, brochures (PDF)"),
    ("Accredited universities and courses", "https://www.nuc.edu.ng", "NUC", ""),
    # identity and travel
    ("NIN enrolment, NIN slip, NIN-SIM linking, modification", "https://nimc.gov.ng", "NIMC", "self-service portal and enrolment centres list"),
    ("International passport application and renewal", "https://immigration.gov.ng", "Nigeria Immigration Service", "e-passport portal; fees paid only through the portal"),
    ("Driver's licence, vehicle number plates", "https://www.nigeriadriverslicence.org", "FRSC", "FRSC main site frsc.gov.ng"),
    ("Voter card (PVC), polling unit", "https://cvr.inecnigeria.org", "INEC", "main site inec.gov.ng"),
    ("NYSC registration, call-up letter, posting", "https://portal.nysc.org.ng", "NYSC", "main site nysc.gov.ng"),
    ("Postcode / postal code lookup", "https://www.nipost.gov.ng", "NIPOST", "postcode finder; also nigeriapostcode.com.ng is NOT official"),
    ("Train tickets Lagos-Ibadan (book here: register with NIN, pay by card on Flutterwave)", "https://nrc.gsds.ng", "Nigerian Railway Corporation", "NRC's official Lagos-Ibadan booking site; NRC says never pay a personal bank account"),
    ("Train tickets Abuja-Kaduna", "https://nrc.tps.ng", "Nigerian Railway Corporation", "NRC's official Abuja-Kaduna booking site"),
    ("Train tickets Warri-Itakpe", "https://nrc-fane.ng", "Nigerian Railway Corporation", "NRC's official Warri-Itakpe booking site"),
    ("Flights", "https://www.flyairpeace.com", "Air Peace", "also arikair.com, ibomair.com, flyoverland.com, unitednigeriaairlines.com"),
    # business and tax
    ("Business name or company registration, annual returns", "https://www.cac.gov.ng", "CAC", "CAC registration portal"),
    ("Tax ID (TIN), tax payment", "https://www.firs.gov.ng", "FIRS", "TaxPro Max; state taxes on each state IRS site (e.g. lirs.gov.ng)"),
    ("Paying government fees", "https://www.remita.net", "Remita", "government fees go through Remita, never to a personal account"),
    # electricity (prepaid tokens, bills)
    ("Electricity in Lagos (Ikeja area)", "https://www.ikejaelectric.com", "Ikeja Electric", "buy token / pay bill: needs meter number"),
    ("Electricity in Lagos (Eko area)", "https://ekedp.com", "Eko Electricity", ""),
    ("Electricity in Oyo, Ogun, Osun, Kwara, parts of Niger, Ekiti, Kogi", "https://www.ibedc.com", "Ibadan Electricity (IBEDC)", ""),
    ("Electricity in Abuja, Kogi, Niger, Nasarawa", "https://www.abujaelectricity.com", "Abuja Electricity (AEDC)", ""),
    ("Electricity in Rivers, Bayelsa, Cross River, Akwa Ibom", "https://www.phed.com.ng", "Port Harcourt Electricity", ""),
    ("Electricity in Enugu, Anambra, Abia, Ebonyi, Imo", "https://www.enugudisco.com", "Enugu Electricity (EEDC)", ""),
    ("Electricity in Kano, Katsina, Jigawa", "https://kedco.ng", "Kano Electricity", ""),
    ("Electricity in Kaduna, Kebbi, Sokoto, Zamfara", "https://kadunaelectric.com", "Kaduna Electric", ""),
    ("Electricity in Benin, Edo, Delta, Ondo, Ekiti", "https://www.bedcpower.com", "Benin Electricity", ""),
    ("Electricity in Jos, Plateau, Bauchi, Benue, Gombe", "https://www.jedplc.com", "Jos Electricity", ""),
    ("Electricity in Yola, Adamawa, Borno, Taraba, Yobe", "https://www.yedc.com.ng", "Yola Electricity", ""),
    # money and phones
    ("Bank services", "the bank's own site or app", "each bank", "never a link from an SMS; banks never ask for PIN or OTP by phone"),
    ("Airtime and data", "https://www.mtn.ng", "MTN", "also airtel.com.ng, gloworld.com, 9mobile.com.ng"),
    # free and legal media, fonts, knowledge
    ("Free legal music downloads", "https://audiomack.com", "Audiomack", "only tracks the artist offers for free download; also archive.org, Free Music Archive, Bandcamp free tracks"),
    ("Free legal films and old classics", "https://archive.org/details/movies", "Internet Archive", "public domain films; YouTube official channels; paid films via official stores only"),
    ("Free fonts with clear licences", "https://fonts.google.com", "Google Fonts", "also fontsquirrel.com (licence per font), the foundry's own site; check the licence page"),
    ("Nigerian news", "https://www.premiumtimesng.com", "Premium Times", "also punchng.com, thecable.ng, channelstv.com, dailytrust.com, bbc.com/yoruba, bbc.com/hausa, bbc.com/igbo"),
    ("History, culture, encyclopaedia", "https://en.wikipedia.org", "Wikipedia", "also yo.wikipedia.org, ha.wikipedia.org, ig.wikipedia.org; check its cited sources"),
    ("Posts on X (Twitter)", "https://x.com", "X", "logged-out search is limited: search the web for site:x.com plus the words, then open the post"),
]

EXTRA_OFFICIAL = {
    "waecdirect.org": "WAEC", "nabteb.gov.ng": "NABTEB", "nigeriadriverslicence.org": "FRSC", "inecnigeria.org": "INEC",
    "nysc.org.ng": "NYSC", "ibedc.com": "Ibadan Electricity", "abujaelectricity.com": "Abuja Electricity",
    "phed.com.ng": "Port Harcourt Electricity", "enugudisco.com": "Enugu Electricity", "kedco.ng": "Kano Electricity",
    "kadunaelectric.com": "Kaduna Electric", "bedcpower.com": "Benin Electricity", "jedplc.com": "Jos Electricity",
    "yedc.com.ng": "Yola Electricity", "unitednigeriaairlines.com": "United Nigeria Airlines", "lirs.gov.ng": "Lagos IRS",
}


def directory() -> str:
    """The short directory the agent reads."""
    return "\n".join(f"- {task}: {site} ({who})" + (f"; {note}" if note else "") for task, site, who, note in SERVICES)
