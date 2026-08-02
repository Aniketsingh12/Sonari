"""Localization for what the agent SAYS.

The agent's language is a per-business setting. The reasoning model already
handles many languages; this module covers the pieces that aren't model output:
the deterministic reply templates (booking confirmations, message
acknowledgements, escalation, closings) and locale-aware date phrasing.

Supported languages are the ones with a full, hand-checked catalogue below.
For any other code we fall back to English rather than emit broken text.
"""
from __future__ import annotations

from datetime import datetime

# code (BCP-47) -> display metadata. `base` keys the catalogues below.
LANGUAGES: dict[str, dict[str, str]] = {
    "en-US": {"base": "en", "name": "English", "native": "English"},
    "es-ES": {"base": "es", "name": "Spanish", "native": "Español"},
    "fr-FR": {"base": "fr", "name": "French", "native": "Français"},
    "de-DE": {"base": "de", "name": "German", "native": "Deutsch"},
    "hi-IN": {"base": "hi", "name": "Hindi", "native": "हिन्दी"},
    "pt-BR": {"base": "pt", "name": "Portuguese", "native": "Português"},
}

DEFAULT_LANG = "en-US"


def base_of(language: str | None) -> str:
    meta = LANGUAGES.get(language or DEFAULT_LANG)
    return meta["base"] if meta else "en"


def language_name(language: str | None) -> str:
    meta = LANGUAGES.get(language or DEFAULT_LANG)
    return meta["name"] if meta else "English"


# --------------------------------------------------------------- date parts
# Python's date.weekday(): Monday = 0 … Sunday = 6.
_WEEKDAYS = {
    "en": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    "es": ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
    "fr": ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
    "de": ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"],
    "hi": ["सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार", "रविवार"],
    "pt": ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira",
           "sexta-feira", "sábado", "domingo"],
}

_MONTHS = {
    "en": ["January", "February", "March", "April", "May", "June", "July",
           "August", "September", "October", "November", "December"],
    "es": ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
           "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    "fr": ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
           "août", "septembre", "octobre", "novembre", "décembre"],
    "de": ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
           "August", "September", "Oktober", "November", "Dezember"],
    "hi": ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई",
           "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
    "pt": ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
           "agosto", "setembro", "outubro", "novembro", "dezembro"],
}

# {weekday}/{day}/{month}/{time} assembled per language. Kept free of a leading
# preposition so it reads correctly after "für"/"para"/etc. in the templates
# that embed it (the message template supplies any preposition).
_DATE_TEMPLATE = {
    "en": "{weekday}, {month} {day} at {time}",
    "es": "el {weekday} {day} de {month} a las {time}",
    "fr": "le {weekday} {day} {month} à {time}",
    "de": "{weekday}, den {day}. {month} um {time} Uhr",
    "hi": "{weekday}, {day} {month} को {time} बजे",
    "pt": "{weekday}, {day} de {month} às {time}",
}


def format_datetime(language: str | None, dt: datetime) -> str:
    """A natural, localized 'day + time' phrase for a booking confirmation."""
    b = base_of(language)
    if b == "en":
        hour = dt.hour % 12 or 12
        ampm = "AM" if dt.hour < 12 else "PM"
        time = f"{hour}:{dt.minute:02d} {ampm}"
    else:
        time = f"{dt.hour}:{dt.minute:02d}"  # 24-hour elsewhere
    return _DATE_TEMPLATE[b].format(
        weekday=_WEEKDAYS[b][dt.weekday()],
        day=dt.day,
        month=_MONTHS[b][dt.month - 1],
        time=time,
    )


# --------------------------------------------------------------- messages
# {name} is a pre-formatted, already-punctuated fragment (", Sam" or "").
MESSAGES: dict[str, dict[str, str]] = {
    "en": {
        "default_greeting": "Thanks for calling {business}! How can I help you today?",
        "booking_confirmed": "Perfect{name} — you're booked for {service} on {when}. "
                             "Is there anything else I can help with?",
        "booking_ask_time": "I'd be happy to book that. What day and time works best for you?",
        "day_full": "It looks like that day is fully booked. Would another day work?",
        "msg_ask_number": "I'll pass your message along. What's the best number for a callback?",
        "msg_taken": "Got it — I've taken your message and the team will get back to you "
                    "shortly. Is there anything else?",
        "escalate_phone": "No problem — let me connect you with the team. You can reach them "
                         "directly at {phone}. I'll also flag this call for follow-up.",
        "escalate_no_phone": "No problem — I'll flag this for the team so a person can follow "
                            "up with you as soon as possible.",
        "closing": "You're welcome! Thanks for calling, and take care.",
        "faq_no_match": "That's a good question — I don't have that detail in front of me, "
                       "but I can take a message and have someone get back to you. "
                       "What's the best number to reach you?",
    },
    "es": {
        "default_greeting": "¡Gracias por llamar a {business}! ¿En qué puedo ayudarle hoy?",
        "booking_confirmed": "Perfecto{name} — le he agendado {service} para {when}. "
                             "¿Puedo ayudarle en algo más?",
        "booking_ask_time": "Con gusto lo agendo. ¿Qué día y hora le viene mejor?",
        "day_full": "Parece que ese día está completo. ¿Le vendría bien otro día?",
        "msg_ask_number": "Le paso el mensaje. ¿Cuál es el mejor número para devolverle la llamada?",
        "msg_taken": "Perfecto — he tomado su mensaje y el equipo se pondrá en contacto pronto. "
                    "¿Algo más?",
        "escalate_phone": "Sin problema — le comunico con el equipo. Puede contactarlos "
                         "directamente en el {phone}. También marcaré esta llamada para seguimiento.",
        "escalate_no_phone": "Sin problema — marcaré esta llamada para que una persona le "
                            "atienda lo antes posible.",
        "closing": "¡De nada! Gracias por llamar y que tenga un buen día.",
        "faq_no_match": "Buena pregunta — no tengo ese dato a mano, pero puedo tomar un mensaje "
                       "y que alguien le devuelva la llamada. ¿Cuál es el mejor número para localizarle?",
    },
    "fr": {
        "default_greeting": "Merci d'appeler {business} ! Comment puis-je vous aider aujourd'hui ?",
        "booking_confirmed": "Parfait{name} — je vous ai réservé {service} pour {when}. "
                             "Puis-je faire autre chose pour vous ?",
        "booking_ask_time": "Avec plaisir. Quel jour et quelle heure vous conviennent le mieux ?",
        "day_full": "Il semble que cette journée soit complète. Un autre jour vous conviendrait-il ?",
        "msg_ask_number": "Je transmets votre message. Quel est le meilleur numéro pour vous rappeler ?",
        "msg_taken": "C'est noté — j'ai pris votre message et l'équipe vous recontactera "
                    "rapidement. Autre chose ?",
        "escalate_phone": "Pas de souci — je vous mets en relation avec l'équipe. Vous pouvez "
                         "les joindre directement au {phone}. Je signale aussi cet appel pour suivi.",
        "escalate_no_phone": "Pas de souci — je signale cet appel pour qu'une personne vous "
                            "recontacte dès que possible.",
        "closing": "Je vous en prie ! Merci de votre appel et bonne journée.",
        "faq_no_match": "Bonne question — je n'ai pas cette information sous la main, mais je "
                       "peux prendre un message et faire en sorte qu'on vous rappelle. Quel est "
                       "le meilleur numéro pour vous joindre ?",
    },
    "de": {
        "default_greeting": "Danke für Ihren Anruf bei {business}! Wie kann ich Ihnen heute helfen?",
        "booking_confirmed": "Perfekt{name} — ich habe {service} für {when} gebucht. "
                             "Kann ich sonst noch etwas für Sie tun?",
        "booking_ask_time": "Das mache ich gerne. Welcher Tag und welche Uhrzeit passen Ihnen am besten?",
        "day_full": "Dieser Tag scheint ausgebucht zu sein. Würde ein anderer Tag passen?",
        "msg_ask_number": "Ich richte Ihre Nachricht aus. Unter welcher Nummer sind Sie am besten erreichbar?",
        "msg_taken": "Alles klar — ich habe Ihre Nachricht notiert und das Team meldet sich in "
                    "Kürze. Kann ich sonst noch helfen?",
        "escalate_phone": "Kein Problem — ich verbinde Sie mit dem Team. Sie erreichen es direkt "
                         "unter {phone}. Ich markiere diesen Anruf außerdem zur Nachverfolgung.",
        "escalate_no_phone": "Kein Problem — ich markiere diesen Anruf, damit sich jemand so bald "
                            "wie möglich bei Ihnen meldet.",
        "closing": "Gern geschehen! Danke für Ihren Anruf und alles Gute.",
        "faq_no_match": "Gute Frage — das habe ich gerade nicht vorliegen, aber ich kann eine "
                       "Nachricht aufnehmen und jemanden zurückrufen lassen. Unter welcher Nummer "
                       "erreichen wir Sie am besten?",
    },
    "hi": {
        "default_greeting": "{business} पर कॉल करने के लिए धन्यवाद! मैं आपकी क्या मदद कर सकता हूँ?",
        "booking_confirmed": "बढ़िया{name} — मैंने {when} के लिए {service} बुक कर दिया है। "
                             "क्या मैं आपकी और कोई मदद कर सकता हूँ?",
        "booking_ask_time": "मैं ख़ुशी से बुक कर दूँगा। आपको कौन सा दिन और समय ठीक रहेगा?",
        "day_full": "लगता है उस दिन सारी बुकिंग भर चुकी हैं। क्या कोई और दिन चलेगा?",
        "msg_ask_number": "मैं आपका संदेश पहुँचा दूँगा। कॉलबैक के लिए सबसे अच्छा नंबर क्या है?",
        "msg_taken": "ठीक है — मैंने आपका संदेश ले लिया है और टीम जल्द ही आपसे संपर्क करेगी। "
                    "और कुछ?",
        "escalate_phone": "कोई बात नहीं — मैं आपको टीम से जोड़ता हूँ। आप उन्हें सीधे {phone} पर "
                         "संपर्क कर सकते हैं। मैं इस कॉल को फ़ॉलो-अप के लिए भी चिह्नित कर दूँगा।",
        "escalate_no_phone": "कोई बात नहीं — मैं इस कॉल को चिह्नित कर देता हूँ ताकि कोई व्यक्ति "
                            "जल्द से जल्द आपसे संपर्क करे।",
        "closing": "आपका स्वागत है! कॉल करने के लिए धन्यवाद, अपना ध्यान रखें।",
        "faq_no_match": "अच्छा सवाल है — यह जानकारी अभी मेरे पास नहीं है, लेकिन मैं संदेश लेकर "
                       "किसी को आपसे संपर्क करने को कह सकता हूँ। आपसे संपर्क करने के लिए सबसे अच्छा "
                       "नंबर क्या है?",
    },
    "pt": {
        "default_greeting": "Obrigado por ligar para {business}! Como posso ajudar hoje?",
        "booking_confirmed": "Perfeito{name} — agendei {service} para {when}. "
                             "Posso ajudar em mais alguma coisa?",
        "booking_ask_time": "Será um prazer agendar. Qual dia e horário são melhores para você?",
        "day_full": "Parece que esse dia está lotado. Outro dia funcionaria?",
        "msg_ask_number": "Vou repassar sua mensagem. Qual o melhor número para retornarmos a ligação?",
        "msg_taken": "Combinado — anotei sua mensagem e a equipe entrará em contato em breve. "
                    "Mais alguma coisa?",
        "escalate_phone": "Sem problema — vou conectar você com a equipe. Você pode falar com "
                         "eles diretamente no {phone}. Também vou sinalizar esta ligação para retorno.",
        "escalate_no_phone": "Sem problema — vou sinalizar esta ligação para que uma pessoa "
                            "entre em contato o quanto antes.",
        "closing": "De nada! Obrigado por ligar e tenha um ótimo dia.",
        "faq_no_match": "Boa pergunta — não tenho esse detalhe em mãos, mas posso anotar um "
                       "recado e pedir que retornem. Qual o melhor número para falar com você?",
    },
}


def t(language: str | None, key: str, **kwargs) -> str:
    """Localized message for the business language, with English fallback."""
    b = base_of(language)
    catalogue = MESSAGES.get(b, MESSAGES["en"])
    template = catalogue.get(key) or MESSAGES["en"][key]
    return template.format(**kwargs)


# Short closing/acknowledgement phrases per language (for the graceful hang-up
# shortcut). Kept lowercase for case-insensitive matching.
CLOSING_PHRASES: dict[str, list[str]] = {
    "en": ["no thanks", "no thank you", "that's all", "thats all", "that is all",
           "nothing else", "i'm good", "im good", "we're good", "all good",
           "goodbye", "bye", "that's it", "thats it", "have a good", "nope"],
    "es": ["no gracias", "eso es todo", "nada más", "nada mas", "estoy bien",
           "adiós", "adios", "hasta luego", "chao", "gracias, adiós"],
    "fr": ["non merci", "c'est tout", "rien d'autre", "ça ira", "ca ira",
           "au revoir", "merci au revoir", "c'est bon"],
    "de": ["nein danke", "das ist alles", "sonst nichts", "alles gut",
           "auf wiederhören", "tschüss", "das wär's", "das wars"],
    "hi": ["नहीं धन्यवाद", "बस इतना ही", "और कुछ नहीं", "ठीक है धन्यवाद",
           "अलविदा", "नमस्ते", "बस", "नहीं"],
    "pt": ["não obrigado", "nao obrigado", "é só isso", "e so isso", "mais nada",
           "tudo certo", "adeus", "tchau", "obrigado, tchau"],
}


def closing_phrases(language: str | None) -> list[str]:
    b = base_of(language)
    # English closings are also accepted everywhere (callers code-switch).
    return CLOSING_PHRASES.get(b, []) + CLOSING_PHRASES["en"]
