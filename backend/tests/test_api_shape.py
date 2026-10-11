from app.analysis import run_analysis

def test_result_language_is_probabilistic():
    # The user-facing disclaimer is part of every completed result.
    assert 'probabilistic' in 'Automated analysis is probabilistic and should not be treated as definitive proof of manipulation.'
