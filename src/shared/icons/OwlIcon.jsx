import React from 'react';

// Base64-encoded owl logo PNG (transparent, can be colored with CSS)
const OWL_LOGO_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAlgAAAJYCAYAAAC+ZpjcAAEAAElEQVR4nOx9d4AURfr2U9XdM7O7szkQJEcFBHUNGBBRQJRgwAUDihE9cz7zgjmdWU9QUUyExYyKgOKCCRURkJzjEjbHCd1V3x/d1V3dM3h3v89V1H6UnZkO1dXdVW89b6i3AB8+fPjw4cOHDx8+fPjw4cOHDx8+fPjw4cOHDx8+fPjw4cOHDx8+fPjw4cOHDx8+fPjw4cOHDx8+fPjw4cOHDx8+fPjw4cOHDx8+fPjw4cOHDx8+fPjw4cOHDx8+fPjw4cOHDx8+fPjw4cOHDx8+fPjw4cOHDx8+fPjw4cOHDx8+fPjw4cOHDx+/KQgAwjkn4vsfXB8fPnz48OHDh48EcM5JcXExxZ+NqxBCQAgBAPpH18WHDx8+fPjw4QOOIUhpzouov32R4bzevXuMCGrKgT8s/nYOgFKF0rjBGAXAfvvr+fDhw4cPHz58/FeghBBGKQUhxBg0aGivrLyC3EVfr1u2detXVX905X4NAdDQuSOGnvnl/M9m89tuuZVnZmS8BqC1oij4U5rhfPjw4cOHDx9/BVBKKQAQgN5x8ZgLb/75p+93PfLov3jLlh1uBqCQ/ZWhFBYWagBCZ48c2fPjDz4yOOfRaa9P5sOGnDIXQBsAoJQKoiWwv96ODx8+fPjw4ePPC8EvaHFxccD6fsBB3Xq9fcdtd/CNa1ZxbtTr111zHU9JybkG+3M4k8X8lKyclndNuHs859HqaOX2Dfr2tb/wF5566odDDz1iCIDjAaC4uFh2T/oky4cPHz58+PDxW4EAQE5Ol4yBReMyAaB9+x4tr7/6ui+/Lf2S1+zdpcfrKqMrfloUGzr0jK1QMs/8Y6v73yGkaOn3XjnuSsbrdsXX/vQd37nuF9ZUsYN/PX8eP+ecsRVZWS0vAICxY8eG8vPzw9Z5Psny4cOHDx8+fPz/ggBAQbuDOyGtVwtAGXbNFddcPO3NabsqynbwSE1FfM3yJYwbjZEZb77FRw0d1QcwZxT+sdXeN0TFQiApD19w3gU8UrkjvnnVEr5h2Y98+5rlrH7PNqN273Y++aWX2ejRF94BAPnt27ds2/3Q1kVAs0bz+/Dhw4cPHz7+0iCA6SHr1euoFgBadu7c8+abrrulYf3KVVxvqOG7t21iW9et5RtX/cI557Hnn32GtW/f/WJAJD347fBbziLk1mccnK2rrqvbUba3okVaKIXXsQhRtACpqKohoWCInVs0nBxzxKEPHNyj0+hnnp/8/LYtK79gBx3VqbeWsXPZsrlN8Gcb+vDhw4cPHz7+exAA/IaiopQJEyY0AUg/6/SzHxt7/ujTB550PDhjsd2792iKphCqACrRgEgd37FzD6pqatMAEM5tHrN/QpjYhgwf1XfG1BmcR2sjq3/+nu/euoHv3LSW79i4jm/fuJbV7d7BIpW7+CfvvcOHnjp8GaAMT0FOGyvC37dm+fDhw4cPHz7+G1BCCObz+SoAnFt0buHTjz/1y8aVK3hj5W69bNM6tnXdar5j4zq+a8sGvmntSl5XUca3rlsdO+OM0TwzM68QRVDwGwe5/+YR85RSDoCsXb2y1bayMgZVIYSoAAgIpaAKhaIopLahkVTX1vOTTjyOTXrukYPvvOPWDw7o0upKxlgqpdQo7m8Hwe+3PlEfPnz8T5BXd6DWP/Ib/aP/H2X68OHjT4qioiKFUsI45+0GkAH/vPWGm5676ooL510y9qyeGekpxp49e5W4HieUAJwbAAeiTRGEczLiG7eVaVVVtdfX1JSvaLnkkBygx2+aG/Q3TzTKOQcAvnt3dXDbtp3UaGriwZQQdMMApQpMTyIHpQQ642T3nkoSTguxO2++Bsf17Xv7S6++edy775VcO6F0ws9jxoxJe/PNNxtgCk3fbejDxx8DAiSYzkmSTw6nnxIAtEePHso';

export function OwlIcon({ size = 24, className = '' }) {
  return (
    <img
      src={`data:image/png;base64,${OWL_LOGO_BASE64}`}
      alt="Owl"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', flexShrink: 0 }}
    />
  );
}

export default OwlIcon;
