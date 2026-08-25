-- Kullanıcı aboneliğini uygulamanın içinden iptal edebilsin.
--
-- NEDEN
--
-- İptalin tek yolu, Stripe'ın gönderdiği makbuz e-postasındaki bağlantıydı.
-- E-postayı bulamayan ya da silmiş olan kullanıcının elinde hiçbir yol
-- kalmıyordu. Para alan bir üründe "nasıl bırakacağım" sorusunun cevabı
-- ürünün içinde olmalı; olmaması hem güveni hem de kart itirazlarını
-- doğrudan etkiliyor.
--
-- İptal, aboneliği ANINDA bitirmiyor: Stripe'ta `cancel_at_period_end`
-- işaretleniyor. Kullanıcı parasını ödediği günün sonuna kadar hakkını
-- kullanıyor, dönem bitince `customer.subscription.deleted` geliyor ve
-- cancel_fast_votes_subscription hakkı kapatıyor. Ortada iade yok, kesilmiş
-- bir hak da yok.

-- Aboneliğin ne zaman biteceği (iptal işaretlendiyse). null ise iptal yok.
alter table public.profiles
  add column if not exists fast_votes_cancel_at timestamptz;

/*
 * İptal işaretini yaz ya da kaldır.
 *
 * Yalnızca sunucu çağırır (service_role): iptal kararı Stripe'ta verilir,
 * burada yalnızca arayüzün doğru göstermesi için bir kopya duruyor. İstemciye
 * yetki verilseydi kullanıcı ödemeden "iptal ettim" yazdırabilirdi — bu satır
 * hakkı belirlemiyor ama tabloyu kirletirdi.
 *
 * p_cancel_at null ise iptal geri alınmış demektir.
 */
create or replace function public.set_fast_votes_cancel(
  p_subscription_id text,
  p_cancel_at       timestamptz
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sayi int;
begin
  update public.profiles
     set fast_votes_cancel_at = p_cancel_at
   where fast_votes_subscription_id = p_subscription_id;

  get diagnostics v_sayi = row_count;
  if v_sayi = 0 then
    return json_build_object('ok', false, 'message', 'Abonelik bu hesapta bulunamadı.');
  end if;
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.set_fast_votes_cancel(text, timestamptz) from public;
revoke all on function public.set_fast_votes_cancel(text, timestamptz) from authenticated;
/*
 * Sunucu tarafına AÇIK izin.
 *
 * Supabase varsayılan olarak public şemadaki fonksiyonları service_role'a
 * veriyor, yani bu satır olmadan da çalışırdı. Yine de yazıyoruz: varsayılan
 * ayarın bir gün değişmesi ya da şemanın başka bir yere taşınması hâlinde
 * iptal işareti sessizce yazılamaz olur ve kimse fark etmez.
 */
grant execute on function public.set_fast_votes_cancel(text, timestamptz) to service_role;

/*
 * Dönem bittiğinde hakkı kapat.
 *
 * Tek değişiklik: iptal işareti de siliniyor. Kalsaydı, aynı kullanıcı daha
 * sonra yeni bir abonelik başlattığında arayüz onu da "iptal edilmiş" diye
 * gösterirdi — abonelik kimliği değiştiği için işaret hiç temizlenmezdi.
 */
create or replace function public.cancel_fast_votes_subscription(p_subscription_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set fast_votes_until = null,
         fast_votes_subscription_id = null,
         fast_votes_since = null,
         fast_votes_cancel_at = null
   where fast_votes_subscription_id = p_subscription_id;
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.cancel_fast_votes_subscription(text) from public;
revoke all on function public.cancel_fast_votes_subscription(text) from authenticated;
grant execute on function public.cancel_fast_votes_subscription(text) to service_role;
