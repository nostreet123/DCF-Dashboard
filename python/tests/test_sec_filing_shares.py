from __future__ import annotations

from dcf_engine.service.sec_filing_shares import (
    extract_berkshire_equivalent_class_a_shares,
    extract_berkshire_share_counts,
)


def test_extract_berkshire_equivalent_class_a_shares_from_10k_cover_page() -> None:
    document_html = """
    <p>Indicate the number of shares outstanding of each of the Registrant's classes of common stock:</p>
    <table>
      <tr>
        <td>January 31, 2026--Class A common stock, $5 par value</td>
        <td><ix:nonFraction name="dei:EntityCommonStockSharesOutstanding">511,820</ix:nonFraction> shares</td>
      </tr>
      <tr>
        <td>January 31, 2026--Class B common stock, $0.0033 par value</td>
        <td><ix:nonFraction name="dei:EntityCommonStockSharesOutstanding">1,389,605,139</ix:nonFraction> shares</td>
      </tr>
    </table>
    """

    shares = extract_berkshire_equivalent_class_a_shares(document_html)

    assert shares == 511820 + (1389605139 / 1500)


def test_extract_berkshire_share_counts_from_10k_cover_page() -> None:
    document_html = """
    <p>Indicate the number of shares outstanding of each of the Registrant's classes of common stock:</p>
    <table>
      <tr>
        <td>January 31, 2026--Class A common stock, $5 par value</td>
        <td><ix:nonFraction name="dei:EntityCommonStockSharesOutstanding">511,820</ix:nonFraction> shares</td>
      </tr>
      <tr>
        <td>January 31, 2026--Class B common stock, $0.0033 par value</td>
        <td><ix:nonFraction name="dei:EntityCommonStockSharesOutstanding">1,389,605,139</ix:nonFraction> shares</td>
      </tr>
    </table>
    """

    shares = extract_berkshire_share_counts(document_html)

    assert shares == (511820, 1389605139)
