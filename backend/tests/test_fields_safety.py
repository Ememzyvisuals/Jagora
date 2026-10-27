from datetime import date

from jagora import fields, safety
from jagora.browser import Element
from jagora.safety import Verdict


def box(label="", type="text", name="", ac="", kind="text box", **kw):
    return Element(id=1, kind=kind, tag="input", type=type, label=label, name=name, autocomplete=ac, **kw)


# ---- numbers said in five languages -----------------------------------------------------------------

def test_phone_numbers_said_in_english_yoruba_hausa_igbo_and_pidgin():
    assert fields.phone("zero seven zero one one one one one one one one").value == "07011111111"
    assert fields.phone("zero seven zero, double one, triple one, one one one").value == "07011111111"
    assert fields.phone("òdo méje òdo ọ̀kan ọ̀kan ọ̀kan ọ̀kan ọ̀kan ọ̀kan ọ̀kan ọ̀kan").value == "07011111111"
    assert fields.phone("sifiri takwas sifiri biyu uku huɗu biyar shida bakwai takwas tara").value == "08023456789"
    assert fields.phone("efu asato efu otu abụọ atọ anọ ise isii asaa asatọ").value == "08012345678"
    assert fields.phone("na 0803 412 7781 be my number").value == "08034127781"


def test_phone_formats_and_mistakes():
    assert fields.phone("+234 701 111 1111").value == "07011111111"
    assert fields.phone("7011111111").value == "07011111111"
    p = fields.phone("0701111111111")
    assert not p.ok and "13 digits" in p.problem
    assert not fields.phone("06011111111").ok
    assert fields.phone("07011111111").shown == "0701 111 1111"


def test_emails_said_aloud():
    assert fields.email("bisi at gmail dot com").value == "bisi@gmail.com"
    assert fields.email("bisi underscore ade at yahoo dot com").value == "bisi_ade@yahoo.com"
    assert fields.email("Bisi.Ade@Gmail.com").value == "bisi.ade@gmail.com"
    assert fields.email("bisi at gmail").value == "bisi@gmail.com"
    assert not fields.email("bisi gmail").ok


def test_dates_day_first_like_in_nigeria():
    today = date(2026, 10, 26)
    assert fields.birth_date("12 March 1999", today).value == "1999-03-12"
    assert fields.birth_date("12/03/1999", today).value == "1999-03-12"
    assert fields.birth_date("March 12, 1999", today).value == "1999-03-12"
    assert fields.birth_date("1999-03-12", today).shown == "12 March 1999"
    assert not fields.birth_date("31/02/1999", today).ok
    assert not fields.birth_date("1 January 2030", today).ok


# ---- what a field is ---------------------------------------------------------------------------------

def test_field_kinds():
    assert fields.field_kind(box("Phone number", type="tel")) == "phone"
    assert fields.field_kind(box("GSM number")) == "phone"
    assert fields.field_kind(box("Email address", type="email")) == "email"
    assert fields.field_kind(box("Date of birth", type="date")) == "date"
    assert fields.field_kind(box("Surname")) == "name"
    assert fields.field_kind(box("Password", type="password")) == "password"
    assert fields.field_kind(box("Enter the OTP sent to your phone")) == "otp"
    assert fields.field_kind(box("Transaction PIN")) == "pin"
    assert fields.field_kind(box("BVN")) == "bvn"
    assert fields.field_kind(box("", ac="cc-number")) == "card"


# ---- the safety gate ---------------------------------------------------------------------------------

def test_secrets_are_never_typed_by_jagora():
    for el in [box("Password", type="password"), box("Enter OTP"), box("Card number"), box("CVV"), box("BVN"), box("4-digit PIN")]:
        assert safety.check_type(el).verdict == Verdict.HANDOFF, el.label
    assert safety.check_type(box("Full name")).verdict == Verdict.ALLOW


def test_anything_that_commits_waits_for_yes():
    btn = lambda label, type="": Element(id=2, kind="button", tag="button", type=type, label=label)
    for label in ["Submit registration", "Pay ₦5,000", "Send money", "Confirm transfer", "Register", "Sign up"]:
        assert safety.check_click(btn(label), "https://x.ng", "x.ng").verdict == Verdict.CONFIRM, label
    assert safety.check_click(btn("Next", type="submit"), "https://x.ng", "x.ng").verdict == Verdict.CONFIRM
    assert safety.check_click(btn("Clear form", type="reset"), "https://x.ng", "x.ng").verdict == Verdict.CONFIRM
    assert safety.check_click(btn("Close notice"), "https://x.ng", "x.ng").verdict == Verdict.ALLOW
    agree = Element(id=3, kind="checkbox", tag="input", type="checkbox", label="I agree to the terms", checked=False)
    assert safety.check_click(agree, "https://x.ng", "x.ng").verdict == Verdict.CONFIRM


def test_leaving_the_site_and_installers():
    out = Element(id=4, kind="link", tag="a", label="Claim prize", href="https://win-prize.xyz/claim")
    assert safety.check_click(out, "https://jamb.gov.ng", "jamb.gov.ng").verdict == Verdict.CONFIRM
    inside = Element(id=5, kind="link", tag="a", label="Check status", href="https://portal.jamb.gov.ng/status")
    assert safety.check_click(inside, "https://jamb.gov.ng", "jamb.gov.ng").verdict == Verdict.ALLOW
    apk = Element(id=6, kind="link", tag="a", label="Download app", href="https://x.ng/bank.apk")
    assert safety.check_click(apk, "https://x.ng", "x.ng").verdict == Verdict.BLOCK
    assert safety.check_navigate("intent://x", "x.ng").verdict == Verdict.BLOCK
    assert safety.site("https://portal.jamb.gov.ng/a") == "jamb.gov.ng"
    assert safety.site("https://www.gtbank.com/") == "gtbank.com"


def test_her_account_locks_are_hers():
    """Passwords, two-step login, recovery details, closing accounts, new money recipients: she does these herself."""
    btn = lambda label: Element(id=2, kind="button", tag="button", label=label)
    for label in ["Delete account", "Change password", "Turn off two-factor authentication", "Change recovery email",
                  "Add new beneficiary", "Close my account", "Disable 2FA"]:
        assert safety.check_click(btn(label), "https://x.ng", "x.ng").verdict == Verdict.HANDOFF, label
    for label in ["Forgot password?", "Sign in", "Check result"]:
        assert safety.check_click(btn(label), "https://x.ng", "x.ng").verdict != Verdict.HANDOFF, label
