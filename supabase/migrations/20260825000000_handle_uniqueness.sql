-- Kullanıcı adı benzersizliği: kontrolü sağlamlaştır ve müsaitlik sorulabilsin.
--
-- Benzersizlik zaten iki katmanda vardı: update_profile önce bakıyor,
-- profiles_handle_idx (lower(handle) üzerinde benzersiz dizin) de arkada
-- tutuyor. Eksik olan iki şey:
--
--   1. YARIŞ. Kontrol ile yazma arasında başka bir işlem aynı adı alabilir.
--      O durumda dizin hatayı veriyor ama kullanıcıya anlaşılmaz bir
--      veritabanı mesajı gidiyordu. Artık yakalanıp aynı anlaşılır cevaba
--      çevriliyor.
--   2. ÖNDEN SORMA. Kullanıcı adı yazarken müsait mi diye sorabilmek için
--      bir yol yoktu; kaydete basıp reddedilmesi gerekiyordu.

/*
 * Bir kullanıcı adı alınabilir mi?
 *
 * Kendi adını sorana "alınmış" demiyoruz — kullanıcı kendi adını koruyabilsin.
 * profiles tablosu zaten herkese açık okunabilir olduğu için bu fonksiyon yeni
 * bir bilgi sızdırmıyor; yalnızca soruyu tek yerde ve doğru kuralla cevaplıyor.
 */
create or replace function public.handle_available(p_handle text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_ad      text := trim(coalesce(p_handle, ''));
begin
  if v_ad !~ '^[A-Za-z0-9_]{3,20}$' then
    return json_build_object(
      'ok', false,
      'message', 'Kullanıcı adı 3–20 karakter olmalı; harf, rakam ve alt çizgi.'
    );
  end if;

  if exists (
    select 1 from public.profiles
    where lower(handle) = lower(v_ad)
      and (v_profile is null or id <> v_profile)
  ) then
    return json_build_object('ok', false, 'message', 'Bu kullanıcı adı alınmış.');
  end if;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.handle_available(text) from public;
grant execute on function public.handle_available(text) to authenticated;

/*
 * Profil güncelleme. Tek değişiklik: kullanıcı adı yazılırken benzersizlik
 * ihlali yakalanıp anlaşılır mesaja çevriliyor.
 */
create or replace function public.update_profile(
  p_handle       text,
  p_display_name text,
  p_x_handle     text,
  p_avatar_url   text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
begin
  if v_profile is null then
    return json_build_object('ok', false, 'message', 'Hesap bulunamadı.');
  end if;

  if p_handle is not null then
    if p_handle !~ '^[A-Za-z0-9_]{3,20}$' then
      return json_build_object('ok', false, 'message',
        'Kullanıcı adı 3–20 karakter olmalı; harf, rakam ve alt çizgi.');
    end if;
    if exists (
      select 1 from public.profiles
      where lower(handle) = lower(p_handle) and id <> v_profile
    ) then
      return json_build_object('ok', false, 'message', 'Bu kullanıcı adı alınmış.');
    end if;

    /*
     * Kontrol ile yazma arasında başkası aynı adı almış olabilir. Benzersiz
     * dizin bunu zaten engelliyor; burada hatayı yakalayıp yukarıdakiyle aynı
     * cevaba çeviriyoruz ki kullanıcı ham bir veritabanı mesajı görmesin.
     */
    begin
      update public.profiles set handle = p_handle where id = v_profile;
    exception when unique_violation then
      return json_build_object('ok', false, 'message', 'Bu kullanıcı adı alınmış.');
    end;
  end if;

  if p_display_name is not null then
    if char_length(p_display_name) < 1 or char_length(p_display_name) > 40 then
      return json_build_object('ok', false, 'message', 'Görünen ad 1–40 karakter olmalı.');
    end if;
    update public.profiles set display_name = p_display_name where id = v_profile;
  end if;

  if p_x_handle is not null then
    if p_x_handle = '' then
      update public.profiles set x_handle = null where id = v_profile;
    elsif p_x_handle !~ '^[A-Za-z0-9_]{1,15}$' then
      return json_build_object('ok', false, 'message', 'X kullanıcı adı en fazla 15 karakter olabilir.');
    else
      update public.profiles set x_handle = p_x_handle where id = v_profile;
    end if;
  end if;

  if p_avatar_url is not null then
    if p_avatar_url = '' then
      update public.profiles set avatar_url = null where id = v_profile;
    elsif char_length(p_avatar_url) > 300000 then
      return json_build_object('ok', false, 'message', 'Görsel çok büyük.');
    else
      update public.profiles set avatar_url = p_avatar_url where id = v_profile;
    end if;
  end if;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.update_profile(text, text, text, text) from public;
grant execute on function public.update_profile(text, text, text, text) to authenticated;
