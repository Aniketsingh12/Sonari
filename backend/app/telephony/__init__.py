"""Provider-agnostic telephony layer.

One shared agent brain (``services.call_service.handle_turn``); one thin adapter
per phone provider. See ``base.py`` for the contract and the shared streaming
loop, and ``twilio.py`` / ``exotel.py`` for concrete adapters.
"""
